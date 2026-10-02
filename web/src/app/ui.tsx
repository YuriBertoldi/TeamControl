/** Peças compartilhadas entre as telas. Tudo sobre a API do Astryx. */

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Card } from '@astryxdesign/core/Card';
import type { Confidencialidade } from '../data/mock';

/** Coluna centrada e limitada — o frame de toda página do sistema. */
export function Page({ titulo, subtitulo, acoes, children, largura = 1080 }: {
  titulo: string; subtitulo?: string; acoes?: ReactNode; children: ReactNode; largura?: number;
}) {
  return (
    // padding 5 e gap 5: a tela é densa de informação, e densidade sem respiro
    // vira parede. Com 16px entre blocos, legenda, chips, estatísticas e
    // treemap se liam como uma massa só — o ar entre eles é o que deixa varrer
    // a página em vez de ler linha a linha.
    <VStack hAlign="center" padding={5} isScrollable height="100%">
      <VStack gap={5} width="100%" maxWidth={largura}>
        <HStack gap={2} vAlign="end" wrap="wrap" hAlign="between" paddingBlockEnd={1}>
          {/* O subtítulo para de esticar até a borda: linha longa demais é
              cansativa de ler e empurra as ações para a linha de baixo. */}
          <VStack gap={0.5} maxWidth={680}>
            <Heading level={1}>{titulo}</Heading>
            {subtitulo && <Text type="supporting">{subtitulo}</Text>}
          </VStack>
          {/* Ações encostam na borda direita — é onde a mão procura. */}
          {acoes && <HStack gap={1} wrap="wrap">{acoes}</HStack>}
        </HStack>
        {children}
      </VStack>
    </VStack>
  );
}

/**
 * Barra de filtros.
 *
 * Dois detalhes que resolvem o desalinhamento que aparecia em todas as telas:
 *
 * 1. **`vAlign="end"`, não `center`.** Controle com rótulo é mais alto que
 *    controle sem rótulo, e centralizar fazia as caixas de texto flutuarem em
 *    alturas diferentes na mesma linha. Alinhando pela base, todas as caixas
 *    assentam na mesma linha independentemente do rótulo acima.
 *
 * 2. **A contagem de resultado vai para a direita, separada.** Ela vinha logo
 *    depois do último controle, então mudava de lugar conforme a quantidade de
 *    filtros — e colava no botão "Limpar". Agora é um bloco próprio na outra
 *    ponta, e o olho sempre a encontra no mesmo lugar.
 *
 * Convenção para quem usa: todo controle aqui leva `size="sm"` e rótulo
 * visível. Misturar rótulo visível com `isLabelHidden` na mesma barra é o que
 * produzia a sensação de bagunça, mesmo com o alinhamento correto.
 */
export function Filtros({ children, resultado }: { children: ReactNode; resultado: string }) {
  return (
    <Card padding={4} variant="muted">
      <HStack gap={3} wrap="wrap" vAlign="end" hAlign="between">
        <HStack gap={3} wrap="wrap" vAlign="end">{children}</HStack>
        <Text type="supporting" hasTabularNumbers>{resultado}</Text>
      </HStack>
    </Card>
  );
}

const CONF_ROTULO: Record<Confidencialidade, string> = {
  1: 'Público', 2: 'RH', 3: 'Privado', 4: 'Restrito',
};
const CONF_COR = { 1: 'green', 2: 'blue', 3: 'orange', 4: 'red' } as const;

export function Conf({ nivel }: { nivel: Confidencialidade }) {
  return <Token size="sm" color={CONF_COR[nivel]} label={CONF_ROTULO[nivel]} />;
}

/** Referência de evidência — é o que torna qualquer afirmação auditável. */
export function Ev({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <HStack gap={0.5} wrap="wrap">
      {refs.map((r) => (
        <Token key={r} size="sm" color="purple" label={r}
               description="Abre a 1:1 de origem, o trecho literal e o minuto da transcrição" />
      ))}
    </HStack>
  );
}

/** Número grande com rótulo — usado no painel. */
export function Metrica({ valor, rotulo, nota, cor }: {
  valor: string | number; rotulo: string; nota?: string;
  cor?: 'red' | 'orange' | 'green' | 'blue';
}) {
  return (
    <Card padding={4} variant={cor ? cor : 'default'}>
      <VStack gap={0.5}>
        <Heading level={2}>{valor}</Heading>
        <Text type="label">{rotulo}</Text>
        {nota && <Text type="supporting">{nota}</Text>}
      </VStack>
    </Card>
  );
}

/* ============================================================
   Linguagem visual da Visão de times: cor por categoria, número
   grande sem moldura e barra de composição empilhada.
   ============================================================ */

export type Cor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'teal'
  | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';

/** Cada família de papel tem a sua cor, e ela é a mesma no sistema inteiro. */
export const COR_CATEGORIA: Record<string, Cor> = {
  Produto: 'orange',
  Desenvolvimento: 'blue',
  'Testes / QA': 'green',
  QA: 'green',
  'UX & Marketing': 'pink',
  'Cloud / Infra': 'cyan',
  Liderança: 'purple',
  Gerência: 'purple',
  // Categorias de skill
  Delphi: 'orange',
  Dados: 'teal',
  Go: 'blue',
  Plataforma: 'cyan',
  Qualidade: 'green',
  IA: 'purple',
  Engenharia: 'yellow',
};

export const corDe = (categoria: string): Cor => COR_CATEGORIA[categoria] ?? 'gray';

/**
 * Estatísticas inline: número grande sobre rótulo pequeno, sem cartão.
 * Na referência elas são um respiro entre o filtro e o conteúdo, não blocos
 * disputando atenção com os dados.
 */
export function Stats({ itens }: {
  itens: { valor: string | number; rotulo: string; cor?: Cor }[];
}) {
  return (
    <HStack gap={5} wrap="wrap" vAlign="end">
      {itens.map((i) => (
        <VStack key={i.rotulo} gap={0}>
          <Heading level={2} color={i.cor === 'red' ? 'accent' : 'primary'}>
            {i.valor}
          </Heading>
          <Text type="supporting">{i.rotulo}</Text>
        </VStack>
      ))}
    </HStack>
  );
}

/**
 * Barra de cadeiras — UMA cadeira por pessoa, não o total por família.
 *
 * É a diferença entre "o time tem 10 devs" e "o time tem estas 10 cadeiras".
 * A família dá o tom, o nível dá a intensidade, e a ordenação põe os seniores
 * à esquerda — então a barra mostra a forma da senioridade de relance.
 */
export function BarraCadeiras({ cadeiras, altura = 14 }: {
  cadeiras: { id: string; cor: Cor; titulo: string }[];
  altura?: number;
}) {
  if (cadeiras.length === 0) return null;
  const largura = 100 / cadeiras.length;
  return (
    <HStack gap={0.5} width="100%" height={altura}>
      {cadeiras.map((c) => (
        <Card key={c.id} padding={0} variant={c.cor} width={`${largura}%`} height={altura}>
          <Text type="supporting" maxLines={1}>{''}</Text>
        </Card>
      ))}
    </HStack>
  );
}

/**
 * Cor da cadeira: a família dá o tom, o nível dá a intensidade.
 * O Astryx não tem escala de intensidade, então cada família usa dois matizes
 * vizinhos — sênior no mais forte, júnior no mais claro.
 */
export function corDaCadeira(familia: string, nivel: string): Cor {
  const senior = nivel === 'Sênior' || nivel === 'Especialista' || nivel === 'Tech Lead';
  switch (familia) {
    case 'Desenvolvimento': return senior ? 'blue' : 'cyan';
    case 'Testes / QA':     return senior ? 'green' : 'teal';
    case 'Produto':         return senior ? 'orange' : 'yellow';
    case 'Liderança':       return 'purple';
    default:                return 'gray';
  }
}

/**
 * Etiqueta curta de cargo: diz de relance se é dev, QA ou Tech Lead.
 * Tech Lead vence a família porque é o papel que muda como você conduz a 1:1.
 */
export function rotuloCargo(p: { familia: string; techLead: boolean; cargo: string }): string {
  if (p.techLead) return 'Tech Lead';
  const area = p.familia === 'Testes / QA' ? 'QA'
             : p.familia === 'Produto' ? 'PO'
             : p.familia === 'Liderança' ? 'Liderança'
             : 'Dev';
  const nivel = p.cargo.includes('Júnior') ? 'Jr'
              : p.cargo.includes('Sênior') ? 'Sr'
              : p.cargo.includes('Especialista') ? 'Esp'
              : 'Pl';
  return `${area} ${nivel}`;
}

/** Ordem de desenho: sênior primeiro, para a barra ter gradiente legível. */
export const PESO_NIVEL: Record<string, number> = {
  'Tech Lead': 0, 'Especialista': 1, 'Sênior': 2, 'Pleno': 3, 'Júnior': 4,
};

/** Legenda da barra: o que cada cor significa, com a contagem. */
export function LegendaComposicao({ partes }: {
  partes: { rotulo: string; valor: number; cor: Cor }[];
}) {
  return (
    <HStack gap={1} wrap="wrap" vAlign="center">
      {partes.filter((p) => p.valor > 0).map((p) => (
        <Token key={p.rotulo} size="sm" color={p.cor} label={`${p.rotulo} ${p.valor}`} />
      ))}
    </HStack>
  );
}

/**
 * Pessoa que o slug não encontra.
 *
 * Acontece de verdade: slug de uma base antiga, alguém removido do cadastro,
 * rota digitada à mão, registro no banco apontando para pessoa que saiu. Antes
 * isto era um `!` no `porSlug` e a tela ficava branca, sem mensagem nenhuma.
 *
 * Mostrar o slug não é detalhe: é o que permite achar o registro órfão e
 * decidir se é dado a corrigir ou cadastro a refazer.
 */
export function PessoaNaoEncontrada({ slug }: { slug: string }) {
  return (
    <VStack gap={1} padding={3}>
      <Text type="label">Liderado não encontrado</Text>
      <Text type="supporting">
        Nenhuma pessoa cadastrada com o identificador <strong>{slug}</strong>. Ou ela
        saiu do cadastro, ou este registro ficou órfão de uma carga anterior.
      </Text>
    </VStack>
  );
}
