package store

// Migrations versionadas, aplicadas em transação no startup — mesmo padrão do
// projeto de referência.
//
// Enums são TEXT + CHECK e não CREATE TYPE: `ALTER TYPE ... ADD VALUE` não pode
// rodar dentro da mesma transação no PostgreSQL 16, e as migrations rodam em
// transação. Com CHECK, acrescentar valor vira DROP/ADD CONSTRAINT, que é
// transacional e reversível.
//
// Isolamento multi-tenant por FK composta: toda tabela filha carrega tenant_id
// e referencia (id, tenant_id) do pai. Assim é o banco, e não o Go, que impede
// uma pessoa de um tenant pendurar em um squad de outro.

type migration struct {
	version int
	name    string
	stmts   []string
}

var migrations = []migration{
	{version: 1, name: "core", stmts: []string{
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
		`CREATE EXTENSION IF NOT EXISTS unaccent`,

		// Escala linear de confidencialidade. Centralizar aqui significa que a
		// regra existe uma vez só, e é o banco que a aplica.
		`CREATE OR REPLACE FUNCTION nivel_visibilidade(c TEXT) RETURNS SMALLINT
		 LANGUAGE sql IMMUTABLE AS $$
		   SELECT CASE c
		     WHEN 'publico_liderado'    THEN 1
		     WHEN 'rh_calibragem'       THEN 2
		     WHEN 'privado_coordenador' THEN 3
		     WHEN 'restrito_saude'      THEN 4
		     ELSE 4
		   END::SMALLINT $$`,

		`CREATE OR REPLACE FUNCTION normaliza_nome(s TEXT) RETURNS TEXT
		 LANGUAGE sql IMMUTABLE AS $$
		   SELECT upper(regexp_replace(unaccent(coalesce(s,'')), '\s+', ' ', 'g')) $$`,

		`CREATE TABLE tenants (
		   id        BIGSERIAL PRIMARY KEY,
		   nome      VARCHAR(120) NOT NULL,
		   slug      VARCHAR(60)  NOT NULL UNIQUE,
		   criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		 )`,

		`CREATE TABLE users (
		   id         BIGSERIAL PRIMARY KEY,
		   tenant_id  BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
		   nome       VARCHAR(120) NOT NULL,
		   email      VARCHAR(160) NOT NULL UNIQUE,
		   senha_hash TEXT NOT NULL,
		   papel      TEXT NOT NULL DEFAULT 'coordenador'
		              CHECK (papel IN ('admin','coordenador','rh','leitura')),
		   ativo      BOOLEAN NOT NULL DEFAULT TRUE,
		   criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id)
		 )`,
		`CREATE INDEX idx_users_tenant ON users(tenant_id)`,

		`CREATE TABLE sessions (
		   token      CHAR(64) PRIMARY KEY,
		   user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		   criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   expira_em  TIMESTAMPTZ NOT NULL,
		   ip         INET,
		   user_agent TEXT
		 )`,
		`CREATE INDEX idx_sessions_exp ON sessions(expira_em)`,

		`CREATE TABLE tribos (
		   id            BIGSERIAL PRIMARY KEY,
		   tenant_id     BIGINT NOT NULL REFERENCES tenants(id),
		   nome          VARCHAR(150) NOT NULL,
		   cor           VARCHAR(20) NOT NULL DEFAULT 'blue',
		   produto       VARCHAR(80),
		   portal_id  VARCHAR(40),
		   coordenacao   TEXT[] NOT NULL DEFAULT '{}',
		   gerencia      TEXT[] NOT NULL DEFAULT '{}',
		   ativo         BOOLEAN NOT NULL DEFAULT TRUE,
		   criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, nome)
		 )`,

		`CREATE TABLE squads (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   tribo_id    BIGINT NOT NULL,
		   nome        VARCHAR(150) NOT NULL,
		   coordenacao TEXT[] NOT NULL DEFAULT '{}',
		   ativo       BOOLEAN NOT NULL DEFAULT TRUE,
		   criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, nome),
		   FOREIGN KEY (tribo_id, tenant_id) REFERENCES tribos(id, tenant_id) ON DELETE RESTRICT
		 )`,

		`CREATE TABLE people (
		   id                 BIGSERIAL PRIMARY KEY,
		   tenant_id          BIGINT NOT NULL REFERENCES tenants(id),
		   squad_id           BIGINT,
		   slug               VARCHAR(60)  NOT NULL,
		   nome_completo      VARCHAR(160) NOT NULL,
		   nome_curto         VARCHAR(60)  NOT NULL,
		   nome_normalizado   VARCHAR(160) NOT NULL,
		   email              VARCHAR(160),
		   familia            TEXT NOT NULL DEFAULT 'desenvolvimento'
		                      CHECK (familia IN ('desenvolvimento','testes_qa','produto','lideranca')),
		   cargo              VARCHAR(100) NOT NULL,
		   eh_tech_lead       BOOLEAN NOT NULL DEFAULT FALSE,
		   qa_de              TEXT CHECK (qa_de IN ('dev','produto')),
		   data_admissao      DATE,
		   data_desligamento  DATE,
		   status             TEXT NOT NULL DEFAULT 'ativo'
		                      CHECK (status IN ('ativo','afastado','fora_gestao','desligado')),
		   motivo_afastamento TEXT,
		   retorno_previsto   DATE,
		   teamguide_employee_id VARCHAR(40),
		   cadencia_dias      SMALLINT NOT NULL DEFAULT 60,
		   observacoes        TEXT,
		   criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, slug),
		   FOREIGN KEY (squad_id, tenant_id) REFERENCES squads(id, tenant_id) ON DELETE SET NULL
		 )`,
		`CREATE INDEX idx_people_tenant_status ON people(tenant_id, status)`,
		`CREATE INDEX idx_people_nome_trgm ON people USING gin (nome_normalizado gin_trgm_ops)`,

		// Tech Lead referencia people, então entra depois dela.
		`ALTER TABLE squads ADD COLUMN tech_lead_id BIGINT`,
		`ALTER TABLE squads ADD CONSTRAINT fk_squad_tl
		   FOREIGN KEY (tech_lead_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE SET NULL`,

		// Aliases são o que faz a ingestão funcionar com os nomes reais dos
		// arquivos: nome abreviado, sem espaço, com grafia divergente.
		`CREATE TABLE person_aliases (
		   id         BIGSERIAL PRIMARY KEY,
		   tenant_id  BIGINT NOT NULL,
		   person_id  BIGINT NOT NULL,
		   alias      VARCHAR(160) NOT NULL,
		   alias_norm VARCHAR(160) NOT NULL,
		   origem     TEXT NOT NULL DEFAULT 'manual'
		              CHECK (origem IN ('manual','arquivo','pasta','teamguide','transcricao')),
		   criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE,
		   UNIQUE (tenant_id, alias_norm)
		 )`,

		`CREATE TABLE app_config (
		   tenant_id  BIGINT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
		   dados      JSONB NOT NULL DEFAULT '{}',
		   atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
		 )`,
	}},

	{version: 2, name: "fontes_reunioes", stmts: []string{
		// Idempotência da ingestão: reimportar o mesmo byte-a-byte é no-op.
		`CREATE TABLE source_files (
		   id             BIGSERIAL PRIMARY KEY,
		   tenant_id      BIGINT NOT NULL REFERENCES tenants(id),
		   caminho        TEXT NOT NULL,
		   nome_arquivo   TEXT NOT NULL,
		   sha256         CHAR(64) NOT NULL,
		   bytes          BIGINT NOT NULL,
		   mtime          TIMESTAMPTZ,
		   tipo_detectado TEXT NOT NULL
		     CHECK (tipo_detectado IN ('tactiq_txt','gemini_notes_pdf','gemini_transcript_pdf',
		            'registro_md','dossie_md','rascunho_avd_md','feedback_md',
		            'material_avd_pdf','colado','desconhecido')),
		   status         TEXT NOT NULL DEFAULT 'pendente'
		     CHECK (status IN ('pendente','processado','ignorado','erro','revisao_manual')),
		   erro           TEXT,
		   motivo_revisao TEXT,
		   meeting_id     BIGINT,
		   person_id      BIGINT,
		   data_reuniao   DATE,
		   data_arquivo   DATE,
		   visto_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   processado_em  TIMESTAMPTZ,
		   UNIQUE (tenant_id, sha256)
		 )`,
		`CREATE INDEX idx_source_files_status ON source_files(tenant_id, status)`,

		// Chave natural (pessoa, data, tipo): a mesma 1:1 vinda do Tactiq e do
		// PDF do Gemini vira UMA reunião com duas fontes, não duas reuniões.
		`CREATE TABLE meetings (
		   id              BIGSERIAL PRIMARY KEY,
		   tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
		   person_id       BIGINT NOT NULL,
		   coordenador_id  BIGINT REFERENCES users(id),
		   tipo            TEXT NOT NULL DEFAULT 'one_on_one'
		     CHECK (tipo IN ('one_on_one','feedback','devolutiva_avd','avulsa','alinhamento')),
		   data            DATE NOT NULL,
		   hora_inicio     TIME,
		   duracao_min     SMALLINT,
		   titulo          TEXT,
		   teamguide_meeting_id VARCHAR(40),
		   data_arquivo    DATE,
		   tem_divergencia_data BOOLEAN NOT NULL DEFAULT FALSE,
		   criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, person_id, data, tipo),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id)
		 )`,
		`CREATE INDEX idx_meetings_person_data ON meetings(tenant_id, person_id, data DESC)`,

		// O texto canônico é IMUTÁVEL. Reprocessar um PDF com outro extrator
		// cria uma source nova; as evidências antigas continuam ancoradas na
		// antiga, e nenhum offset aponta para lixo.
		`CREATE TABLE meeting_sources (
		   id             BIGSERIAL PRIMARY KEY,
		   tenant_id      BIGINT NOT NULL,
		   meeting_id     BIGINT NOT NULL,
		   source_file_id BIGINT REFERENCES source_files(id),
		   fonte          TEXT NOT NULL
		     CHECK (fonte IN ('tactiq','gemini_notes','gemini_transcript','colado','teamguide','manual')),
		   kind           TEXT NOT NULL
		     CHECK (kind IN ('transcricao_bruta','notas_sumarizadas','payload_api')),
		   texto          TEXT NOT NULL,
		   texto_sha256   CHAR(64) NOT NULL,
		   extrator       TEXT,
		   qualidade_extracao TEXT NOT NULL DEFAULT 'ok'
		     CHECK (qualidade_extracao IN ('ok','parcial','falhou','revisado_manual')),
		   url_original   TEXT,
		   confidencialidade TEXT NOT NULL DEFAULT 'privado_coordenador'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, meeting_id, texto_sha256),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE CASCADE
		 )`,

		`CREATE TABLE transcript_lines (
		   id                BIGSERIAL PRIMARY KEY,
		   meeting_source_id BIGINT NOT NULL REFERENCES meeting_sources(id) ON DELETE CASCADE,
		   ord               INT NOT NULL,
		   ts_offset_sec     INT,
		   falante_raw       VARCHAR(160),
		   falante_person_id BIGINT REFERENCES people(id),
		   eh_coordenador    BOOLEAN NOT NULL DEFAULT FALSE,
		   texto             TEXT NOT NULL,
		   char_start        INT NOT NULL,
		   char_end          INT NOT NULL,
		   ruido             BOOLEAN NOT NULL DEFAULT FALSE,
		   UNIQUE (meeting_source_id, ord)
		 )`,
		`CREATE INDEX idx_tl_source_ts ON transcript_lines(meeting_source_id, ts_offset_sec)`,
		`CREATE INDEX idx_tl_fts ON transcript_lines USING gin (to_tsvector('portuguese', texto))`,

		`ALTER TABLE source_files ADD CONSTRAINT fk_sf_meeting
		   FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL`,
		`ALTER TABLE source_files ADD CONSTRAINT fk_sf_person
		   FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL`,
	}},

	{version: 3, name: "registros", stmts: []string{
		`CREATE TABLE meeting_records (
		   id              BIGSERIAL PRIMARY KEY,
		   tenant_id       BIGINT NOT NULL,
		   meeting_id      BIGINT NOT NULL,
		   formato         TEXT NOT NULL
		     CHECK (formato IN ('compartilhavel','privado_coordenador','avaliacao_1a1','justificativa_avd')),
		   confidencialidade TEXT NOT NULL
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   versao          SMALLINT NOT NULL DEFAULT 1,
		   supersedes_id   BIGINT REFERENCES meeting_records(id),
		   markdown        TEXT NOT NULL,
		   resumo          TEXT,
		   tema            TEXT,
		   gerado_por      TEXT NOT NULL
		     CHECK (gerado_por IN ('claude_code','llm_go','manual','importado')),
		   modelo          VARCHAR(60),
		   prompt_version  VARCHAR(40),
		   revisado_humano BOOLEAN NOT NULL DEFAULT FALSE,
		   arquivo_origem  TEXT,
		   criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (meeting_id, formato, versao),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE CASCADE
		 )`,

		// Amarra formato e confidencialidade no banco. Sem isto, basta um
		// descuido para o registro privado nascer como público.
		`ALTER TABLE meeting_records ADD CONSTRAINT ck_record_confid CHECK (
		   (formato = 'compartilhavel'      AND confidencialidade = 'publico_liderado') OR
		   (formato = 'privado_coordenador' AND confidencialidade IN ('privado_coordenador','restrito_saude')) OR
		   (formato IN ('avaliacao_1a1','justificativa_avd')
		                                    AND confidencialidade IN ('rh_calibragem','privado_coordenador'))
		 )`,

		`CREATE TABLE meeting_evals (
		   id            BIGSERIAL PRIMARY KEY,
		   tenant_id     BIGINT NOT NULL,
		   meeting_id    BIGINT NOT NULL,
		   performance   TEXT NOT NULL
		     CHECK (performance IN ('precisa_melhorar','satisfatoria','excepcional')),
		   performance_justificativa TEXT,
		   impacto       SMALLINT CHECK (impacto BETWEEN 1 AND 5),
		   impacto_justificativa TEXT,
		   notas_compartilhadas TEXT,
		   notas_privadas       TEXT,
		   origem        TEXT NOT NULL DEFAULT 'local' CHECK (origem IN ('local','teamguide')),
		   confidencialidade TEXT NOT NULL DEFAULT 'rh_calibragem'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   UNIQUE (tenant_id, meeting_id),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE CASCADE
		 )`,

		// A seção "Omitido de propósito" vira registro permanente: você lembra
		// que cortou algo e por quê, sem o conteúdo circular.
		`CREATE TABLE record_omissions (
		   id           BIGSERIAL PRIMARY KEY,
		   tenant_id    BIGINT NOT NULL,
		   meeting_id   BIGINT NOT NULL,
		   item         TEXT NOT NULL,
		   onde_omitido TEXT NOT NULL,
		   motivo       TEXT NOT NULL,
		   confidencialidade TEXT NOT NULL DEFAULT 'privado_coordenador'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE CASCADE
		 )`,
	}},

	{version: 4, name: "compromissos_feedbacks", stmts: []string{
		`CREATE TABLE action_items (
		   id                 BIGSERIAL PRIMARY KEY,
		   tenant_id          BIGINT NOT NULL,
		   person_id          BIGINT NOT NULL,
		   meeting_id         BIGINT,
		   responsavel_tipo   TEXT NOT NULL DEFAULT 'liderado'
		     CHECK (responsavel_tipo IN ('liderado','coordenador','terceiro','ambos')),
		   responsavel_nome   VARCHAR(120),
		   descricao          TEXT NOT NULL,
		   -- O prazo textual original fica, porque é o que foi combinado de
		   -- fato; a data é a interpretação, e ter as duas permite auditar.
		   prazo_texto        TEXT,
		   prazo_date         DATE,
		   prazo_vago         BOOLEAN NOT NULL DEFAULT FALSE,
		   status             TEXT NOT NULL DEFAULT 'aberto'
		     CHECK (status IN ('aberto','em_andamento','concluido','cancelado','reaberto')),
		   concluido_em       DATE,
		   recorrencia_count  SMALLINT NOT NULL DEFAULT 1,
		   nota_herdado       TEXT,
		   confidencialidade  TEXT NOT NULL DEFAULT 'publico_liderado'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   hash_dedupe        CHAR(64) NOT NULL,
		   criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, meeting_id, hash_dedupe),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE SET NULL
		 )`,
		`CREATE INDEX idx_ai_abertos ON action_items(tenant_id, status, prazo_date)
		   WHERE status IN ('aberto','em_andamento','reaberto')`,

		`CREATE TABLE feedbacks (
		   id              BIGSERIAL PRIMARY KEY,
		   tenant_id       BIGINT NOT NULL,
		   person_id       BIGINT NOT NULL,
		   direcao         TEXT NOT NULL CHECK (direcao IN ('recebido','dado')),
		   tipo            TEXT NOT NULL DEFAULT 'positivo'
		     CHECK (tipo IN ('positivo','construtivo','elogio','reconhecimento')),
		   autor_nome      VARCHAR(160),
		   autor_person_id BIGINT REFERENCES people(id),
		   autor_externo   BOOLEAN NOT NULL DEFAULT FALSE,
		   data            DATE NOT NULL,
		   titulo          TEXT,
		   texto           TEXT NOT NULL,
		   fonte           TEXT NOT NULL DEFAULT 'manual'
		     CHECK (fonte IN ('teamguide','arquivo_md','manual','extraido_1a1')),
		   teamguide_feedback_id VARCHAR(40),
		   confidencialidade TEXT NOT NULL DEFAULT 'publico_liderado'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   hash_dedupe     CHAR(64) NOT NULL,
		   criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (tenant_id, hash_dedupe),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id)
		 )`,
		`CREATE INDEX idx_fb_person_data ON feedbacks(tenant_id, person_id, data DESC)`,
	}},

	// Ciclo de avaliação parametrizado. Nada de "AVD-2026" no código: o ciclo
	// é linha de tabela, com a própria escala, as próprias faixas e os próprios
	// drivers. Em 2027-S1 você cadastra um novo, herda os drivers do anterior
	// e o histórico de 2026 continua intacto para comparação.
	{version: 5, name: "ciclo_avd", stmts: []string{
		`CREATE TABLE avd_cycles (
		   id              BIGSERIAL PRIMARY KEY,
		   tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
		   codigo          VARCHAR(30) NOT NULL,
		   nome            VARCHAR(120) NOT NULL,
		   periodo_inicio  DATE NOT NULL,
		   periodo_fim     DATE NOT NULL,
		   janela_calibragem_inicio DATE,
		   janela_calibragem_fim    DATE,
		   escala_min      SMALLINT NOT NULL DEFAULT 1,
		   escala_max      SMALLINT NOT NULL DEFAULT 4,
		   faixa_baixo_max NUMERIC(3,2) NOT NULL DEFAULT 2.40,
		   faixa_medio_max NUMERIC(3,2) NOT NULL DEFAULT 3.50,
		   meses_minimos   SMALLINT NOT NULL DEFAULT 6,
		   status          TEXT NOT NULL DEFAULT 'aberto'
		     CHECK (status IN ('rascunho','aberto','calibragem','devolutiva','fechado')),
		   teamguide_assessment_id VARCHAR(40),
		   criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, codigo),
		   CHECK (periodo_fim >= periodo_inicio)
		 )`,

		// Rótulo de cada nota da escala: "1 Nunca" num ciclo pode virar outra
		// coisa no seguinte, e a defesa de calibragem precisa do rótulo da época.
		`CREATE TABLE avd_scale_labels (
		   cycle_id BIGINT NOT NULL REFERENCES avd_cycles(id) ON DELETE CASCADE,
		   nota     SMALLINT NOT NULL,
		   rotulo   VARCHAR(40) NOT NULL,
		   PRIMARY KEY (cycle_id, nota)
		 )`,

		`CREATE TABLE avd_drivers (
		   id        BIGSERIAL PRIMARY KEY,
		   cycle_id  BIGINT NOT NULL REFERENCES avd_cycles(id) ON DELETE CASCADE,
		   eixo      TEXT NOT NULL CHECK (eixo IN ('comportamento','desempenho')),
		   ordem     SMALLINT NOT NULL,
		   nome      VARCHAR(140) NOT NULL,
		   descricao TEXT,
		   teamguide_criteria_id VARCHAR(40),
		   UNIQUE (cycle_id, eixo, ordem)
		 )`,

		`CREATE TABLE avd_open_questions (
		   id       BIGSERIAL PRIMARY KEY,
		   cycle_id BIGINT NOT NULL REFERENCES avd_cycles(id) ON DELETE CASCADE,
		   ordem    SMALLINT NOT NULL,
		   pergunta TEXT NOT NULL,
		   teamguide_criteria_id VARCHAR(40),
		   UNIQUE (cycle_id, ordem)
		 )`,

		`CREATE TABLE nine_box_quadrants (
		   codigo              VARCHAR(30) PRIMARY KEY,
		   nome                VARCHAR(60) NOT NULL,
		   faixa_comportamento TEXT NOT NULL CHECK (faixa_comportamento IN ('baixo','medio','alto')),
		   faixa_desempenho    TEXT NOT NULL CHECK (faixa_desempenho IN ('baixo','medio','alto')),
		   UNIQUE (faixa_comportamento, faixa_desempenho)
		 )`,
		`INSERT INTO nine_box_quadrants (codigo, nome, faixa_comportamento, faixa_desempenho) VALUES
		   ('estrela','Estrela','alto','alto'),
		   ('forte_comportamento','Forte Comportamento','alto','medio'),
		   ('diamante_bruto','Diamante Bruto','alto','baixo'),
		   ('forte_desempenho','Forte Desempenho','medio','alto'),
		   ('mantenedor','Mantenedor','medio','medio'),
		   ('questionavel','Questionável','medio','baixo'),
		   ('comprometido','Comprometido','baixo','alto'),
		   ('eficaz','Eficaz','baixo','medio'),
		   ('insuficiente','Insuficiente','baixo','baixo')`,

		`CREATE TABLE avd_evaluations (
		   id             BIGSERIAL PRIMARY KEY,
		   tenant_id      BIGINT NOT NULL,
		   cycle_id       BIGINT NOT NULL REFERENCES avd_cycles(id) ON DELETE CASCADE,
		   person_id      BIGINT NOT NULL,
		   tipo           TEXT NOT NULL CHECK (tipo IN ('lider','auto','par')),
		   status         TEXT NOT NULL DEFAULT 'rascunho'
		     CHECK (status IN ('rascunho','preenchida','enviada','calibrada','devolvida')),
		   quadrante_alvo  VARCHAR(30) REFERENCES nine_box_quadrants(codigo),
		   quadrante_final VARCHAR(30) REFERENCES nine_box_quadrants(codigo),
		   media_comportamento NUMERIC(4,2),
		   media_desempenho    NUMERIC(4,2),
		   elegivel        BOOLEAN NOT NULL DEFAULT TRUE,
		   motivo_inelegivel TEXT,
		   contexto        TEXT,
		   teamguide_participant_id VARCHAR(40),
		   teamguide_evaluation_id  VARCHAR(40),
		   sincronizado_em TIMESTAMPTZ,
		   confidencialidade TEXT NOT NULL DEFAULT 'rh_calibragem'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   UNIQUE (tenant_id, cycle_id, person_id, tipo),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,

		`CREATE TABLE avd_driver_scores (
		   id            BIGSERIAL PRIMARY KEY,
		   evaluation_id BIGINT NOT NULL REFERENCES avd_evaluations(id) ON DELETE CASCADE,
		   driver_id     BIGINT NOT NULL REFERENCES avd_drivers(id) ON DELETE CASCADE,
		   nota          SMALLINT NOT NULL,
		   comentario    TEXT,
		   -- Proposta da IA fica separada da nota: a direção é nota → texto,
		   -- nunca texto → nota. Quem digita a nota é o coordenador.
		   nota_sugerida SMALLINT,
		   enviado_em    TIMESTAMPTZ,
		   UNIQUE (evaluation_id, driver_id)
		 )`,

		`CREATE TABLE avd_open_answers (
		   id            BIGSERIAL PRIMARY KEY,
		   evaluation_id BIGINT NOT NULL REFERENCES avd_evaluations(id) ON DELETE CASCADE,
		   question_id   BIGINT NOT NULL REFERENCES avd_open_questions(id) ON DELETE CASCADE,
		   resposta      TEXT NOT NULL,
		   enviado_em    TIMESTAMPTZ,
		   UNIQUE (evaluation_id, question_id)
		 )`,

		`CREATE TABLE avd_calibration_defenses (
		   id              BIGSERIAL PRIMARY KEY,
		   evaluation_id   BIGINT NOT NULL REFERENCES avd_evaluations(id) ON DELETE CASCADE,
		   tese            TEXT NOT NULL,
		   por_que_nao_maior TEXT,
		   trajetoria      TEXT,
		   risco           TEXT,
		   nivel_risco     TEXT CHECK (nivel_risco IN ('alto','medio','baixo')),
		   markdown        TEXT,
		   -- Preenchido DEPOIS da mesa: comparar o questionado com o previsto é
		   -- o único mecanismo que calibra a régua do coordenador ano a ano.
		   questionado_na_mesa TEXT,
		   desfecho        TEXT,
		   confidencialidade TEXT NOT NULL DEFAULT 'rh_calibragem'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   UNIQUE (evaluation_id)
		 )`,

		`CREATE OR REPLACE FUNCTION avd_faixa(media NUMERIC, baixo_max NUMERIC, medio_max NUMERIC)
		 RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
		   SELECT CASE WHEN media <= baixo_max THEN 'baixo'
		               WHEN media <= medio_max THEN 'medio'
		               ELSE 'alto' END $$`,
	}},

	// Evidência é o átomo do sistema. Tudo o que a IA escreve — comentário de
	// driver, resposta aberta, defesa de calibragem — precisa citar evidência
	// que EXISTE, pertence à pessoa e cabe no teto de confidencialidade.
	// Sem isso, "relatório gerado por IA" é texto sem lastro, e na mesa de
	// calibragem uma afirmação sem lastro é um problema real.
	{version: 6, name: "evidencias_geracao", stmts: []string{
		`CREATE TABLE evidences (
		   id                BIGSERIAL PRIMARY KEY,
		   tenant_id         BIGINT NOT NULL,
		   -- Código estável e citável pela IA: EV-2026-09-22-PESSOA-007.
		   -- É ele que reconstrói resposta -> evidência -> trecho -> minuto.
		   ref_code          VARCHAR(48) NOT NULL,
		   person_id         BIGINT NOT NULL,
		   meeting_id        BIGINT,
		   meeting_source_id BIGINT REFERENCES meeting_sources(id) ON DELETE SET NULL,
		   char_start        INT,
		   char_end          INT,
		   ts_offset_sec     INT,
		   feedback_id       BIGINT REFERENCES feedbacks(id) ON DELETE CASCADE,
		   meeting_record_id BIGINT REFERENCES meeting_records(id) ON DELETE SET NULL,
		   data_evidencia    DATE NOT NULL,
		   -- Citação literal + conferência de que ela existe mesmo no texto
		   -- canônico. Só evidência verificada entra em context pack.
		   trecho            TEXT NOT NULL,
		   trecho_verificado BOOLEAN NOT NULL DEFAULT FALSE,
		   parafrase         TEXT NOT NULL,
		   tipo              TEXT NOT NULL DEFAULT 'entrega'
		     CHECK (tipo IN ('entrega','comportamento','aprendizado','risco',
		                     'reconhecimento','impedimento','dependencia_externa')),
		   -- Evidência contrária é cidadã de primeira classe: é ela que
		   -- sustenta o "por que Médio e não Alto" na calibragem.
		   valencia          TEXT NOT NULL DEFAULT 'neutra'
		     CHECK (valencia IN ('positiva','neutra','atencao','risco')),
		   origem            TEXT NOT NULL
		     CHECK (origem IN ('llm_extracao','coordenador','importacao','teamguide')),
		   modelo            VARCHAR(60),
		   prompt_version    VARCHAR(40),
		   confianca         NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
		   confidencialidade TEXT NOT NULL DEFAULT 'privado_coordenador'
		     CHECK (confidencialidade IN ('publico_liderado','rh_calibragem','privado_coordenador','restrito_saude')),
		   aprovada          BOOLEAN NOT NULL DEFAULT FALSE,
		   criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (id, tenant_id),
		   UNIQUE (tenant_id, ref_code),
		   CHECK (num_nonnulls(meeting_source_id, feedback_id, meeting_record_id) >= 1),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE,
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE SET NULL
		 )`,
		`CREATE INDEX idx_ev_person_data ON evidences(tenant_id, person_id, data_evidencia DESC)`,
		`CREATE INDEX idx_ev_fts ON evidences
		   USING gin (to_tsvector('portuguese', parafrase || ' ' || trecho))`,

		`CREATE TABLE evidence_links (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   evidence_id BIGINT NOT NULL REFERENCES evidences(id) ON DELETE CASCADE,
		   alvo_tipo   TEXT NOT NULL
		     CHECK (alvo_tipo IN ('skill','avd_driver','avd_open_question','motivacao',
		                          'action_item','pdi_milestone','feedback','alerta')),
		   alvo_id     BIGINT NOT NULL,
		   peso        NUMERIC(3,2) NOT NULL DEFAULT 1.0,
		   nota        TEXT,
		   criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		   UNIQUE (evidence_id, alvo_tipo, alvo_id)
		 )`,
		`CREATE INDEX idx_evlink_alvo ON evidence_links(tenant_id, alvo_tipo, alvo_id)`,

		// Lastro da resposta: qual evidência sustenta cada comentário de driver
		// e cada resposta aberta. ON DELETE RESTRICT porque não se apaga
		// evidência que sustenta resposta já enviada.
		`CREATE TABLE avd_answer_evidences (
		   id            BIGSERIAL PRIMARY KEY,
		   evaluation_id BIGINT NOT NULL REFERENCES avd_evaluations(id) ON DELETE CASCADE,
		   driver_id     BIGINT REFERENCES avd_drivers(id) ON DELETE CASCADE,
		   question_id   BIGINT REFERENCES avd_open_questions(id) ON DELETE CASCADE,
		   evidence_id   BIGINT NOT NULL REFERENCES evidences(id) ON DELETE RESTRICT,
		   citado_como   VARCHAR(48),
		   CHECK (num_nonnulls(driver_id, question_id) = 1)
		 )`,

		// Auditoria da geração: dado um texto, responder meses depois "com que
		// dados exatos isso foi gerado?". Sem isso não há reprodutibilidade.
		`CREATE TABLE geracoes (
		   id                BIGSERIAL PRIMARY KEY,
		   tenant_id         BIGINT NOT NULL REFERENCES tenants(id),
		   escopo            TEXT NOT NULL
		     CHECK (escopo IN ('avd_driver','avd_aberta','defesa_calibragem',
		                       'registro_1a1','pauta_1a1','relatorio')),
		   person_id         BIGINT,
		   cycle_id          BIGINT REFERENCES avd_cycles(id) ON DELETE SET NULL,
		   audiencia         TEXT NOT NULL CHECK (audiencia IN ('liderado','rh','coordenador')),
		   confidencialidade_max TEXT NOT NULL
		     CHECK (confidencialidade_max IN ('publico_liderado','rh_calibragem','privado_coordenador')),
		   context_pack      JSONB NOT NULL,
		   context_pack_hash CHAR(64) NOT NULL,
		   modelo            VARCHAR(60),
		   prompt_version    VARCHAR(40),
		   saida             TEXT NOT NULL,
		   -- Resultado da validação determinística: refs inexistentes, números
		   -- fora do pack, termos proibidos. Falhou, não exporta.
		   validacao_ok      BOOLEAN NOT NULL DEFAULT FALSE,
		   validacao_erros   JSONB NOT NULL DEFAULT '[]',
		   verificado_humano BOOLEAN NOT NULL DEFAULT FALSE,
		   criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
		 )`,
		`CREATE INDEX idx_geracoes_pessoa ON geracoes(tenant_id, person_id, escopo, criado_em DESC)`,

		`CREATE TABLE access_log (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   user_id     BIGINT REFERENCES users(id),
		   acao        TEXT NOT NULL,
		   audiencia   TEXT,
		   person_id   BIGINT,
		   evidence_id BIGINT,
		   geracao_id  BIGINT,
		   detalhe     JSONB NOT NULL DEFAULT '{}',
		   em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
		 )`,
	}},

	// v7 alinha o banco ao modelo de identificação que a interface usa.
	//
	// As telas trabalham com slug — string estável, escolhida por quem cadastra
	// — e não com id gerado. Isso não é preferência: pauta, avaliação, matriz
	// de skills e DNA referenciam pessoa por slug, e um id sequencial quebraria
	// essas referências na primeira recarga.
	//
	// Tribo e squad ganham o mesmo tratamento, e squad passa a ter membros
	// explícitos. A relação só por `people.squad_id` não comporta alguém em
	// duas squads, que é situação real e que a tela já marca com "+1 squad".
	{version: 7, name: "slugs_e_remuneracao", stmts: []string{
		`ALTER TABLE tribos ADD COLUMN slug VARCHAR(60)`,
		`UPDATE tribos SET slug = 'tribo-' || id WHERE slug IS NULL`,
		`ALTER TABLE tribos ALTER COLUMN slug SET NOT NULL`,
		`ALTER TABLE tribos ADD CONSTRAINT tribos_tenant_slug_key UNIQUE (tenant_id, slug)`,

		`ALTER TABLE squads ADD COLUMN slug VARCHAR(60)`,
		`UPDATE squads SET slug = 'squad-' || id WHERE slug IS NULL`,
		`ALTER TABLE squads ALTER COLUMN slug SET NOT NULL`,
		`ALTER TABLE squads ADD CONSTRAINT squads_tenant_slug_key UNIQUE (tenant_id, slug)`,

		// As colunas por slug convivem com as FKs numéricas: as antigas seguem
		// garantindo o isolamento entre tenants, as novas são o que a interface
		// entende. Daí tribo_id deixar de ser obrigatória.
		`ALTER TABLE squads ADD COLUMN tribo_slug VARCHAR(60)`,
		`ALTER TABLE squads ADD COLUMN tech_lead_slug VARCHAR(60)`,
		`ALTER TABLE squads ADD COLUMN membros TEXT[] NOT NULL DEFAULT '{}'`,
		`ALTER TABLE squads ALTER COLUMN tribo_id DROP NOT NULL`,

		// A unicidade por nome impedia duas squads homônimas em tribos
		// diferentes, que é arranjo legítimo. O slug passa a ser a chave.
		`ALTER TABLE squads DROP CONSTRAINT IF EXISTS squads_tenant_id_nome_key`,

		// Remuneração: confidencialidade 3. Não sai em relatório, export nem
		// pacote para IA — a trava está no código. A coluna existe sobretudo
		// pelo alerta de tempo sem reajuste, que é o dado de gestão que importa.
		`ALTER TABLE people ADD COLUMN salario INTEGER`,
		`ALTER TABLE people ADD COLUMN ultimo_reajuste DATE`,
		`ALTER TABLE people ADD COLUMN faixa_salarial VARCHAR(60)`,
	}},

	{version: 8, name: "defesa_sem_tese", stmts: []string{
		// A tese deixa de ser obrigatória na defesa de calibragem.
		//
		// O material real tem uma defesa escrita sem linha de tese — e não é
		// descuido: é justamente o caso em que o quadrante pedido não se
		// sustentou na evidência, e o autor foi direto para as âncoras
		// objetivas em vez de abrir com um resumo que não se sustentaria.
		//
		// O que o sistema exige de uma defesa é a CONTRA-EVIDÊNCIA, não o
		// resumo: é ela que responde "por que não mais alto" na mesa. Obrigar
		// a tese forçaria a inventar uma frase para satisfazer o banco, que é
		// exatamente o tipo de preenchimento que esvazia o instrumento.
		`ALTER TABLE avd_calibration_defenses ALTER COLUMN tese DROP NOT NULL`,
	}},

	{version: 9, name: "pessoa_manual", stmts: []string{
		// Separa "quem a carga descobriu" de "quem o coordenador decidiu".
		//
		// As duas coisas moravam na mesma coluna, e isso impedia as duas de
		// funcionarem ao mesmo tempo. Se a carga gravasse ali de quem é cada
		// arquivo — que é o que a tela precisa para parar de dizer "sem pessoa"
		// em tudo —, a passada seguinte leria a própria resposta anterior como
		// se fosse decisão humana e nunca mais reconsideraria: um erro de
		// vínculo ficaria congelado, e corrigir o parser não corrigiria nada.
		//
		// Com a marca separada, a carga pode registrar o que descobriu sem
		// ganhar autoridade sobre si mesma, e a escolha humana continua sendo
		// a única que a carga não pode desfazer.
		`ALTER TABLE source_files ADD COLUMN pessoa_manual BOOLEAN NOT NULL DEFAULT FALSE`,
	}},

	{version: 10, name: "pauta", stmts: []string{
		// "Para a próxima conversa" da ata, que era lido e jogado fora.
		//
		// É o gatilho de pauta mais barato que existe e o mais honesto: não é
		// inferência sobre a pessoa, é literalmente o que ficou combinado na
		// conversa anterior. Sem persistir, toda vez que a 1:1 chega alguém
		// precisa reler a ata — que é exatamente o trabalho que o sistema
		// existe para tirar.
		`CREATE TABLE meeting_next_topics (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   meeting_id  BIGINT NOT NULL,
		   ordem       SMALLINT NOT NULL,
		   texto       TEXT NOT NULL,
		   UNIQUE (tenant_id, meeting_id, ordem),
		   FOREIGN KEY (meeting_id, tenant_id) REFERENCES meetings(id, tenant_id) ON DELETE CASCADE
		 )`,

		// Natureza separa "prazo" de "modo de trabalhar".
		//
		// 28 dos 161 encaminhamentos dizem "Contínuo", e outros tantos "Sob
		// demanda" ou "A partir de agora". Nada disso é data: é combinado de
		// conduta, que não vence. Tratá-los como prazo encheria o board de
		// vencido falso, e board que grita por engano é board que se aprende a
		// ignorar — junto com o que gritava com razão.
		`ALTER TABLE action_items
		   ADD COLUMN natureza TEXT NOT NULL DEFAULT 'indefinido'
		   CHECK (natureza IN ('prazo','continuo','indefinido'))`,

		// A data que o sistema PROPÕE, separada da que vale.
		//
		// `prazo_date` só é preenchida por decisão humana. A sugestão fica em
		// coluna própria porque a direção importa: o sistema oferece a leitura
		// de "Próximas semanas", e quem assume o compromisso confirma. Gravar
		// direto em `prazo_date` faria o board cobrar uma data que ninguém
		// combinou — e a primeira vez que isso acontecesse numa 1:1 o
		// instrumento perderia a confiança de quem o usa.
		`ALTER TABLE action_items ADD COLUMN prazo_sugerido DATE`,
		`ALTER TABLE action_items ADD COLUMN prazo_confirmado_em TIMESTAMPTZ`,

		`CREATE INDEX idx_ai_pessoa_status ON action_items (tenant_id, person_id, status)`,
	}},

	{version: 11, name: "desenvolvimento", stmts: []string{
		// Skills, PDI, trilha e DNA. As quatro telas existiam e liam de lugar
		// nenhum — não havia tabela para nada disso.

		// Nível de skill é SÉRIE TEMPORAL, não estado.
		//
		// Nunca sofre UPDATE: cada leitura é uma linha nova. A evolução ao
		// longo do tempo é o produto — "subiu de 2 para 3 em março, com esta
		// evidência" é o que sustenta uma conversa de carreira. Guardar só o
		// estado atual descartaria exatamente isso, e descartaria em silêncio.
		//
		// `skill_codigo` é texto sem chave estrangeira de propósito: o
		// catálogo de skills é editável na tela e mora no navegador. Uma FK
		// para tabela que não existe aqui impediria a avaliação de ser gravada;
		// guardar o nome junto com o código faz a linha continuar legível mesmo
		// que a skill seja renomeada ou removida do catálogo depois.
		`CREATE TABLE person_skill_assessments (
		   id           BIGSERIAL PRIMARY KEY,
		   tenant_id    BIGINT NOT NULL,
		   person_id    BIGINT NOT NULL,
		   skill_codigo TEXT NOT NULL,
		   skill_nome   TEXT NOT NULL,
		   nivel        SMALLINT NOT NULL CHECK (nivel BETWEEN 0 AND 4),
		   -- Interesse (0–3) é separado da proficiência de propósito: é o
		   -- conector com o DNA. Proficiência 1 com interesse 3 é um PDI
		   -- esperando para acontecer; proficiência 1 com interesse 0 numa
		   -- skill estratégica é uma conversa difícil que precisa acontecer.
		   interesse    SMALLINT CHECK (interesse BETWEEN 0 AND 3),
		   origem       TEXT NOT NULL CHECK (origem IN
		                  ('coordenador','autoavaliacao','llm_extracao','avd','par')),
		   observacao   TEXT,
		   avaliado_em  DATE NOT NULL DEFAULT CURRENT_DATE,
		   criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,
		`CREATE INDEX idx_psa_pessoa ON person_skill_assessments
		   (tenant_id, person_id, skill_codigo, avaliado_em DESC)`,

		// O estado atual é uma VIEW, e por origem: a leitura do líder e a
		// autoavaliação coexistem, e é a distância entre elas que vira item
		// obrigatório de pauta. Colapsar as duas numa nota só apagaria o gap,
		// que é o dado mais útil da matriz inteira.
		`CREATE VIEW person_skills_atual AS
		   SELECT DISTINCT ON (tenant_id, person_id, skill_codigo, origem)
		          tenant_id, person_id, skill_codigo, skill_nome, nivel,
		          interesse, origem, observacao, avaliado_em
		     FROM person_skill_assessments
		    ORDER BY tenant_id, person_id, skill_codigo, origem,
		             avaliado_em DESC, id DESC`,

		// PDI. Objetivo sem skill-alvo é recusado pela coluna NOT NULL: é o
		// que transforma "estudar Go" (incobrável) em "Go/APIs HTTP: 1→3 até
		// março, evidenciado por PR em produção".
		`CREATE TABLE pdi_plans (
		   id           BIGSERIAL PRIMARY KEY,
		   tenant_id    BIGINT NOT NULL,
		   person_id    BIGINT NOT NULL,
		   titulo       TEXT NOT NULL,
		   skill_codigo TEXT NOT NULL,
		   skill_nome   TEXT NOT NULL,
		   nivel_atual  SMALLINT NOT NULL CHECK (nivel_atual BETWEEN 0 AND 4),
		   nivel_alvo   SMALLINT NOT NULL CHECK (nivel_alvo BETWEEN 0 AND 4),
		   prazo        DATE,
		   status       TEXT NOT NULL DEFAULT 'ativo'
		                CHECK (status IN ('ativo','concluido','abandonado','pausado')),
		   motivo       TEXT,
		   criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
		   CHECK (nivel_alvo > nivel_atual),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,
		`CREATE TABLE pdi_milestones (
		   id           BIGSERIAL PRIMARY KEY,
		   tenant_id    BIGINT NOT NULL,
		   plan_id      BIGINT NOT NULL REFERENCES pdi_plans(id) ON DELETE CASCADE,
		   ordem        SMALLINT NOT NULL,
		   descricao    TEXT NOT NULL,
		   prazo        DATE,
		   concluido_em DATE,
		   evidencia    TEXT,
		   UNIQUE (plan_id, ordem)
		 )`,

		// Trilha QA → Dev. Os níveis e critérios são cadastro, não código:
		// eles mudam conforme a trilha é calibrada, e recompilar para corrigir
		// um critério é o tipo de atrito que faz o instrumento ser abandonado.
		`CREATE TABLE track_levels (
		   codigo       TEXT PRIMARY KEY,
		   nome         TEXT NOT NULL,
		   identidade   TEXT NOT NULL,
		   ordem        SMALLINT NOT NULL,
		   -- Nem todo QA vai virar dev, e tudo bem. Trilha com saída única
		   -- transformaria N2 e N3 em fracasso, quando ambos já resolvem o
		   -- problema de negócio.
		   saida_valida TEXT
		 )`,
		`CREATE TABLE track_criteria (
		   id            BIGSERIAL PRIMARY KEY,
		   level_codigo  TEXT NOT NULL REFERENCES track_levels(codigo) ON DELETE CASCADE,
		   ordem         SMALLINT NOT NULL,
		   -- Todo critério tem verbo observável e produz artefato. Nada de
		   -- "demonstrar maturidade": isso não é verificável, e critério não
		   -- verificável vira avaliação de simpatia.
		   descricao     TEXT NOT NULL,
		   artefato      TEXT,
		   UNIQUE (level_codigo, ordem)
		 )`,
		`CREATE TABLE person_track_progress (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   person_id   BIGINT NOT NULL,
		   criterio_id BIGINT NOT NULL REFERENCES track_criteria(id) ON DELETE CASCADE,
		   atendido_em DATE,
		   evidencia   TEXT,
		   nota        TEXT,
		   UNIQUE (tenant_id, person_id, criterio_id),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,

		// DNA motivacional. A camada estável (âncoras de Schein) e a volátil
		// (motivadores) em tabelas separadas porque mudam em ritmos
		// diferentes, e o delta da volátil entre duas leituras é o sinal de
		// retenção mais honesto que existe.
		`CREATE TABLE motivation_profiles (
		   id                 BIGSERIAL PRIMARY KEY,
		   tenant_id          BIGINT NOT NULL,
		   person_id          BIGINT NOT NULL,
		   ancora_primaria    TEXT,
		   ancora_secundaria  TEXT,
		   -- "O que eu NÃO quero" previne mais erro de alocação que saber o
		   -- que a pessoa quer.
		   ancora_rejeitada   TEXT,
		   aspiracao          TEXT,
		   pref_feedback      TEXT,
		   pref_reconhecimento TEXT,
		   origem             TEXT NOT NULL DEFAULT 'coordenador'
		                      CHECK (origem IN ('coordenador','autodeclarado','planilha','llm_extracao')),
		   atualizado_em      DATE NOT NULL DEFAULT CURRENT_DATE,
		   UNIQUE (tenant_id, person_id),
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,
		`CREATE TABLE motivation_signals (
		   id          BIGSERIAL PRIMARY KEY,
		   tenant_id   BIGINT NOT NULL,
		   person_id   BIGINT NOT NULL,
		   motivador   TEXT NOT NULL,
		   posicao     SMALLINT,
		   -- A distância entre "Maestria é meu top 1" e "e não está sendo
		   -- atendido" é a definição operacional de risco de saída, declarada
		   -- pela própria pessoa, sem modelo preditivo nenhum.
		   atendimento TEXT CHECK (atendimento IN ('atendido','parcial','nao')),
		   origem      TEXT NOT NULL DEFAULT 'coordenador',
		   lido_em     DATE NOT NULL DEFAULT CURRENT_DATE,
		   FOREIGN KEY (person_id, tenant_id) REFERENCES people(id, tenant_id) ON DELETE CASCADE
		 )`,
		`CREATE INDEX idx_ms_pessoa ON motivation_signals (tenant_id, person_id, lido_em DESC)`,
	}},

	{version: 12, name: "trilha_qa_dev", stmts: []string{
		// A trilha QA → Dev, semeada.
		//
		// Duas premissas de desenho estão codificadas aqui, não só escritas:
		//
		// 1. **Nem todo QA vai virar dev, e tudo bem.** N2 e N3 têm
		//    `saida_valida` preenchida: quem chega lá já resolveu o problema de
		//    negócio mesmo que nunca escreva Delphi. Trilha com saída única
		//    transformaria os dois em fracasso.
		// 2. **Todo critério tem verbo observável e produz artefato.** Nada de
		//    "demonstrar maturidade" — isso não é verificável, e critério não
		//    verificável vira avaliação de simpatia.
		`INSERT INTO track_levels (codigo, nome, identidade, ordem, saida_valida) VALUES
		  ('N0','Executor','Executa roteiro definido por outro',0,NULL),
		  ('N1','Analista de Testes','Modela os próprios cenários e levanta risco',1,NULL),
		  ('N2','QA Automação','Opera e estende a suíte existente',2,
		   'Deixou de ser manual — o problema de negócio já está resolvido aqui'),
		  ('N3','QA Engineer (SDET)','Constrói a ferramenta de teste, não só o teste',3,
		   'Engenharia de qualidade — carreira própria, não degrau para dev'),
		  ('N4','Dev Jr. com veia de qualidade','Entrega feature e bug no produto',4,
		   'Entra na trilha de desenvolvimento')`,

		`INSERT INTO track_criteria (level_codigo, ordem, descricao, artefato) VALUES
		  ('N1',1,'Modelou os próprios cenários de teste para ao menos 3 demandas, sem roteiro pronto','cenários escritos no card'),
		  ('N1',2,'Levantou risco não previsto na análise em ao menos 2 demandas','apontamento no card, aceito pelo time'),
		  ('N1',3,'Escreveu SQL de pós-condição sem apoio','consulta anexada à evidência de teste'),
		  ('N1',4,'Usou Git sem apoio (branch, commit, push, PR)','histórico do repositório'),

		  ('N2',1,'Executou do zero ao verde ao menos 5 casos no repositório de automação','casos no *-robotframework-e2e'),
		  ('N2',2,'Teve ao menos 3 PRs mesclados na suíte','PRs no Bitbucket'),
		  ('N2',3,'Classificou corretamente falha de teste × bug de produto em ao menos 10 ocorrências','triagem registrada'),
		  ('N2',4,'Manteve a suíte verde por 2 semanas corridas','histórico do pipeline'),

		  ('N3',1,'Escreveu ao menos 3 Mapping.py do zero, aprovados em review','arquivos no repositório'),
		  ('N3',2,'Criou ao menos 1 helper reutilizado POR OUTRA PESSOA','uso do helper em PR de terceiro'),
		  ('N3',3,'Manteve a suíte estável por 4 semanas corridas','histórico do pipeline'),
		  ('N3',4,'Revisou PR de terceiro com apontamento aceito','comentário no PR'),
		  ('N3',5,'Reduziu tempo ou escopo de uma regressão, com número antes e depois','medição registrada'),

		  ('N4',1,'Entregou ao menos 2 correções de bug no produto, mescladas','PRs no produto'),
		  ('N4',2,'Entregou ao menos 1 feature pequena de ponta a ponta','card concluído'),
		  ('N4',3,'Escreveu teste unitário para o próprio código','testes no PR'),
		  ('N4',4,'Participou de sprint zero ou refinamento com contribuição técnica aceita','ata do refinamento')`,
	}},
}
