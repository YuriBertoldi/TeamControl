package models

// Testes da trava de confidencialidade.
//
// Esta é a regra que, se quebrar, vaza dado de pessoa — relato de saúde num
// relatório para o RH, leitura privada do coordenador num documento entregue
// ao liderado. Não é teste de funcionalidade, é teste de segurança.
//
// A arquitetura coloca a regra em UM lugar (Scope.FiltroSQL) de propósito: se
// ela existisse em três, uma delas estaria errada, e seria a que vaza.

import (
	"strings"
	"testing"
)

func TestConfidencialidadeNivel(t *testing.T) {
	casos := []struct {
		c     Confidencialidade
		nivel int
	}{
		{ConfPublicoLiderado, 1},
		{ConfRHCalibragem, 2},
		{ConfPrivadoCoordenador, 3},
		{ConfRestritoSaude, 4},
	}
	for _, caso := range casos {
		if got := caso.c.Nivel(); got != caso.nivel {
			t.Errorf("%s: nível %d, esperado %d", caso.c, got, caso.nivel)
		}
	}
}

func TestConfidencialidadeDesconhecidaEhMaisRestrita(t *testing.T) {
	// Valor que o banco não deveria produzir, mas pode chegar de uma migração
	// mal feita ou de um dado antigo. O default seguro é tratar como saúde:
	// errar escondendo custa uma consulta a mais; errar mostrando é vazamento.
	var lixo Confidencialidade = "qualquer-coisa"
	if lixo.Nivel() != 4 {
		t.Fatalf("confidencialidade desconhecida caiu em nível %d, deveria ser 4", lixo.Nivel())
	}

	var vazio Confidencialidade
	if vazio.Nivel() != 4 {
		t.Fatalf("confidencialidade vazia caiu em nível %d, deveria ser 4", vazio.Nivel())
	}
}

func TestAudienciaNivelMax(t *testing.T) {
	casos := []struct {
		a     Audiencia
		nivel int
	}{
		{AudLiderado, 1},
		{AudRH, 2},
		{AudCoordenador, 3},
	}
	for _, caso := range casos {
		got, err := caso.a.NivelMax()
		if err != nil {
			t.Fatalf("%s devolveu erro: %v", caso.a, err)
		}
		if got != caso.nivel {
			t.Errorf("%s: nível máximo %d, esperado %d", caso.a, got, caso.nivel)
		}
	}
}

func TestNenhumaAudienciaAlcancaSaude(t *testing.T) {
	// Nível 4 é dado de saúde (LGPD art. 11). Nenhuma audiência o alcança —
	// nem a de coordenador. Só a leitura direta na tela, com flag explícita.
	for _, a := range []Audiencia{AudLiderado, AudRH, AudCoordenador} {
		n, err := a.NivelMax()
		if err != nil {
			t.Fatalf("%s: %v", a, err)
		}
		if n >= 4 {
			t.Fatalf("audiência %s alcança nível %d — saúde ficou exposta", a, n)
		}
	}
}

func TestAudienciaInvalidaFalha(t *testing.T) {
	// Audiência vazia é o zero value. Se ela resolvesse para algo, uma struct
	// Scope construída sem campos viraria permissão silenciosa.
	var vazia Audiencia
	if _, err := vazia.NivelMax(); err == nil {
		t.Fatal("audiência vazia não devolveu erro — zero value virou permissão")
	}
	if _, err := Audiencia("admin").NivelMax(); err == nil {
		t.Fatal("audiência inventada não devolveu erro")
	}
}

func TestScopeValidate(t *testing.T) {
	ok := Scope{TenantID: 1, UserID: 1, Aud: AudCoordenador}
	if err := ok.Validate(); err != nil {
		t.Fatalf("scope válido recusado: %v", err)
	}

	invalidos := map[string]Scope{
		"sem tenant":         {UserID: 1, Aud: AudCoordenador},
		"sem audiência":      {TenantID: 1, UserID: 1},
		"audiência inválida": {TenantID: 1, UserID: 1, Aud: "root"},
	}
	for nome, s := range invalidos {
		if err := s.Validate(); err == nil {
			t.Errorf("%s: scope inválido foi aceito", nome)
		}
	}
}

func TestScopeAceitaLeituraSemUsuario(t *testing.T) {
	// UserID zero é legítimo: o seed e o watcher leem sem usuário logado.
	// Exigi-lo aqui quebraria a ingestão — e o rastro de quem leu o quê é
	// responsabilidade do access_log, que só registra leitura de nível 3 e 4.
	s := Scope{TenantID: 1, Aud: AudCoordenador}
	if err := s.Validate(); err != nil {
		t.Fatalf("leitura de sistema recusada: %v", err)
	}
}

func TestScopeZeroValueNaoVale(t *testing.T) {
	// A peça central da arquitetura: Scope{} não tem valor zero usável. Quem
	// esquecer de preencher recebe erro, não acesso total.
	var s Scope
	if err := s.Validate(); err == nil {
		t.Fatal("Scope{} foi aceito — o zero value virou acesso irrestrito")
	}
}

func TestFiltroSQLSempreLimitaONivel(t *testing.T) {
	for _, a := range []Audiencia{AudLiderado, AudRH, AudCoordenador} {
		s := Scope{TenantID: 1, UserID: 1, Aud: a}
		sql, args, err := s.FiltroSQL("confidencialidade")
		if err != nil {
			t.Fatalf("%s: %v", a, err)
		}
		if !strings.Contains(sql, "nivel_visibilidade") {
			t.Errorf("%s: filtro não usa nivel_visibilidade: %q", a, sql)
		}
		if len(args) == 0 {
			t.Errorf("%s: filtro sem argumento — nível virou literal no SQL", a)
		}

		esperado, _ := a.NivelMax()
		achou := false
		for _, arg := range args {
			if n, ok := arg.(int); ok && n == esperado {
				achou = true
			}
		}
		if !achou {
			t.Errorf("%s: nível máximo %d não apareceu nos argumentos %v", a, esperado, args)
		}
	}
}

func TestFiltroSQLProtegeSaudePorPadrao(t *testing.T) {
	s := Scope{TenantID: 1, UserID: 1, Aud: AudCoordenador}
	sql, _, err := s.FiltroSQL("confidencialidade")
	if err != nil {
		t.Fatal(err)
	}
	// Sem IncluirSaude, o filtro tem que barrar o nível 4 explicitamente —
	// não basta o teto da audiência, porque um dia alguém cria audiência 4.
	if !strings.Contains(sql, "4") {
		t.Errorf("filtro não barra nível 4 explicitamente: %q", sql)
	}
}

func TestFiltroSQLComSaudeExigeAudienciaDeCoordenador(t *testing.T) {
	// Pedir saúde com audiência de RH ou de liderado é erro de programação,
	// não uma preferência a ser silenciosamente ignorada.
	for _, a := range []Audiencia{AudLiderado, AudRH} {
		s := Scope{TenantID: 1, UserID: 1, Aud: a, IncluirSaude: true}
		_, _, err := s.FiltroSQL("confidencialidade")
		if err == nil {
			t.Errorf("audiência %s conseguiu pedir dado de saúde", a)
		}
	}
}

func TestFiltroSQLRecusaScopeInvalido(t *testing.T) {
	var s Scope
	if _, _, err := s.FiltroSQL("confidencialidade"); err == nil {
		t.Fatal("FiltroSQL aceitou Scope{} — qualquer query sairia sem filtro")
	}
}

func TestFiltroSQLUsaAColunaInformada(t *testing.T) {
	s := Scope{TenantID: 1, UserID: 1, Aud: AudRH}
	sql, _, err := s.FiltroSQL("r.confidencialidade")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, "r.confidencialidade") {
		t.Errorf("filtro ignorou a coluna qualificada: %q", sql)
	}
}
