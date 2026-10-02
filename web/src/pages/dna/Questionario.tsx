/**
 * Questionário do DNA Motivacional — 21 pares de escolha forçada.
 *
 * Duas decisões de desenho:
 *
 * 1. **Apuração ao vivo, resultado escondido até o fim.** Ver a contagem subir
 *    enquanto responde enviesaria as últimas respostas em direção ao perfil
 *    que já apareceu. O progresso aparece; o placar por eixo, não.
 *
 * 2. **Importar os seis totais é caminho de primeira classe.** Quem já
 *    respondeu na planilha não precisa refazer 21 escolhas: a linha de soma
 *    tem tudo o que a apuração precisa. Fingir que só existe o questionário
 *    faria o sistema ser contornado no primeiro uso.
 */

import { PessoaNaoEncontrada } from '../../app/ui';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Save, X, Table2 } from 'lucide-react';

import { HOJE, porSlug } from '../../data/mock';
import {
  PARES, EIXOS, ROTULO_POLO, apurar, apurarTotais, gravarDNA, descricaoPessoal,
  type Respostas, type Polo,
} from '../../data/dna';

export function QuestionarioDNA({ slug, aoSalvar, aoCancelar }: {
  slug: string;
  aoSalvar: () => void;
  aoCancelar?: () => void;
}) {
  const [modo, setModo] = useState<'questionario' | 'planilha'>('questionario');
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <SegmentedControl size="sm" label="Como registrar" value={modo}
                          onChange={(v) => setModo(v as 'questionario' | 'planilha')}>
          <SegmentedControlItem value="questionario" label="Responder as 21 questões" />
          <SegmentedControlItem value="planilha" label="Importar totais da planilha" />
        </SegmentedControl>
        {aoCancelar && (
          <Button icon={<X size={14} />} size="sm" variant="ghost"
                  label="Cancelar" onClick={aoCancelar} />
        )}
      </HStack>

      {modo === 'questionario'
        ? <Perguntas slug={slug} aoSalvar={aoSalvar} />
        : <ImportarTotais slug={slug} aoSalvar={aoSalvar} />}
    </VStack>
  );
}

/* ---------- questionário ---------- */

function Perguntas({ slug, aoSalvar }: { slug: string; aoSalvar: () => void }) {
  const [respostas, setRespostas] = useState<Respostas>({});
  const [data, setData] = useState(HOJE);
  const [nota, setNota] = useState('');

  const ap = apurar(respostas);
  const p = porSlug(slug);
  if (!p) return <PessoaNaoEncontrada slug={slug} />;

  const salvar = () => {
    gravarDNA({ slug, data, respostas, origem: 'questionario', nota: nota || undefined });
    aoSalvar();
  };

  return (
    <VStack gap={2}>
      <Card padding={4}>
        <VStack gap={1.5}>
          <Heading level={3}>DNA Motivacional de {p.curto}</Heading>
          <Text type="supporting">
            Em cada par, a afirmativa que melhor descreve como {p.curto} tem agido na
            maior parte da vida. Às vezes as duas servem — nesse caso, qual reflete
            melhor? Responder rápido dá resultado mais preciso que analisar demais.
          </Text>
          <ProgressBar
            label={`${ap.respondidos} de ${ap.total} respondidas`}
            value={ap.respondidos}
            max={ap.total}
            variant={ap.completo ? 'success' : 'accent'}
          />
        </VStack>
      </Card>

      {PARES.map((par) => {
        const escolhido = respostas[par.n];
        return (
          <Card key={par.n} padding={2}>
            <VStack gap={1}>
              <Text type="label">{par.n}.</Text>
              {par.opcoes.map((op) => (
                <Button
                  key={op.polo}
                  variant={escolhido === op.polo ? 'primary' : 'ghost'}
                  label={op.texto}
                  onClick={() => setRespostas({ ...respostas, [par.n]: op.polo })}
                />
              ))}
            </VStack>
          </Card>
        );
      })}

      <Card padding={4}>
        <VStack gap={2}>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Data da leitura (AAAA-MM-DD)" value={data} onChange={setData} />
            <TextInput label="Observação (opcional)" value={nota} onChange={setNota}
                       placeholder="o que o número não conta" />
          </HStack>
          {!ap.completo ? (
            <Banner
              status="info"
              title={`Faltam ${ap.total - ap.respondidos} respostas`}
              description="O código de três letras só sai com as 21 escolhas feitas — um eixo incompleto produziria uma letra que não se sustenta."
            />
          ) : (
            <Card padding={2} variant="muted">
              <VStack gap={1}>
                <HStack gap={1} vAlign="center" wrap="wrap">
                  <Text type="label">Perfil apurado</Text>
                  {ap.codigo && <Token size="sm" color="teal" label={ap.codigo} />}
                  {ap.perfil && <Token size="sm" color="blue" label={ap.perfil.nome} />}
                </HStack>
                {descricaoPessoal(ap, p.curto).map((par, i) => (
                  <Text key={i} type={i === 0 ? 'body' : 'supporting'}>{par}</Text>
                ))}
              </VStack>
            </Card>
          )}
          <HStack gap={1}>
            <Button icon={<Save size={14} />} variant="primary" label="Salvar leitura"
                    onClick={salvar} isDisabled={!ap.completo} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

/* ---------- importação dos totais ---------- */

function ImportarTotais({ slug, aoSalvar }: { slug: string; aoSalvar: () => void }) {
  const [totais, setTotais] = useState<Partial<Record<Polo, number>>>({});
  const [data, setData] = useState(HOJE);

  const ap = apurarTotais(totais);
  const soma = Object.values(totais).reduce<number>((s, n) => s + (n ?? 0), 0);

  const salvar = () => {
    gravarDNA({
      slug, data, respostas: {}, origem: 'planilha',
      totaisImportados: totais as Record<Polo, number>,
    });
    aoSalvar();
  };

  return (
    <VStack gap={2}>
      <Banner
        status="info"
        title="Copie a linha de totais da aba “DNA MOTIVACIONAL”"
        description="É a linha de soma logo abaixo das 21 questões, com um número por coluna (A a F). Seis números e pronto — não é preciso refazer o questionário."
      />

      <Card padding={4}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Table2 size={16} />
            <Heading level={3}>Totais por coluna</Heading>
          </HStack>

          {EIXOS.map((eixo) => (
            <VStack key={eixo.id} gap={1}>
              <Text type="label">{eixo.nome}</Text>
              <HStack gap={2} wrap="wrap" vAlign="end">
                {eixo.polos.map((polo, i) => (
                  <NumberInput
                    key={polo}
                    label={`${ROTULO_POLO[polo]} (coluna ${COLUNA_DO_POLO[polo]})`}
                    value={totais[polo] ?? 0}
                    onChange={(v) => setTotais({ ...totais, [polo]: v })}
                    min={0}
                    max={21}
                    description={`letra ${eixo.letras[i]} no código`}
                  />
                ))}
              </HStack>
            </VStack>
          ))}

          <Divider />

          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting">Soma: {soma}</Text>
            {soma !== 21 && soma > 0 && (
              <Token size="sm" color="orange" label="o total deveria ser 21" />
            )}
            {ap.codigo && <Token size="sm" color="teal" label={ap.codigo} />}
            {ap.perfil && <Text type="supporting">{ap.perfil.nome}</Text>}
          </HStack>

          {/* O perfil e a leitura aparecem ANTES de salvar: é o que deixa
              conferir contra a planilha de origem e perceber número trocado. */}
          {ap.completo && (
            <Card padding={2} variant="muted">
              <VStack gap={1}>
                <Text type="label">Perfil que estes números produzem</Text>
                {descricaoPessoal(ap, porSlug(slug)?.curto ?? slug).map((par, i) => (
                  <Text key={i} type={i === 0 ? 'body' : 'supporting'}>{par}</Text>
                ))}
              </VStack>
            </Card>
          )}

          {soma !== 21 && soma > 0 && (
            <Banner
              status="warning"
              title={`Os seis números somam ${soma}, não 21`}
              description="São 21 pares e uma escolha por par. Se a planilha fecha diferente, provavelmente há par em branco ou marcado duas vezes — vale conferir antes de salvar, porque o código sai errado em silêncio."
            />
          )}

          <TextInput label="Data da leitura (AAAA-MM-DD)" value={data} onChange={setData} />

          <HStack gap={1}>
            <Button icon={<Save size={14} />} variant="primary" label="Salvar leitura"
                    onClick={salvar} isDisabled={!ap.completo} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

/** Coluna da planilha correspondente a cada polo — ajuda a conferir na origem. */
const COLUNA_DO_POLO: Record<Polo, string> = {
  producao: 'A',
  interioridade: 'B',
  conexao: 'C',
  estabilidade: 'D',
  exterioridade: 'E',
  variedade: 'F',
};
