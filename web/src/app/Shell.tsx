/**
 * Frame do sistema: AppShell + SideNav colapsável com ícones.
 *
 * Voltou para menu lateral porque são 15 destinos — não cabem numa barra
 * superior sem virar rolagem horizontal. Colapsado vira trilha de ícones e
 * devolve a largura para o conteúdo, que é denso em quase toda tela.
 *
 * Cada rota é carregada sob demanda com React.lazy: um chunk por tela, com
 * pré-carga no hover para o Suspense não piscar.
 */

import { lazy, Suspense, useState, useMemo, type ReactNode } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavItem, SideNavHeading, SideNavSection } from '@astryxdesign/core/SideNav';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { Spinner } from '@astryxdesign/core/Spinner';
import {
  LayoutDashboard, Network, UserRound, MessagesSquare, ListChecks,
  Grid3x3, Target, Route, ClipboardCheck, Scale, Siren, FileText,
  Compass, FolderInput, BookUser, CalendarRange, NotebookPen, HeartHandshake, Settings,
} from 'lucide-react';

import { ARQUIVOS, ALERTAS } from '../data/mockOps';
import { COMPROMISSOS, PESSOAS, HOJE, diasEntre } from '../data/mock';
import { PDIS, QAS, AVD } from '../data/mockCiclo';
import { ITENS } from '../data/mockLider';

/* O Painel é a rota inicial e por isso não é lazy. */
import Painel from '../pages/Painel';
import { ProvedorNavegacao, type Navegacao } from './navegacao';

const SquadsPage = lazy(() => import('../pages/Squads'));
const Pessoas = lazy(() => import('../pages/Pessoas'));
const Preparo1a1 = lazy(() => import('../pages/Preparo1a1'));
const RegistrosPage = lazy(() => import('../pages/Registros'));
const DNAPage = lazy(() => import('../pages/DNA'));
const Compromissos = lazy(() => import('../pages/Compromissos'));
const Skills = lazy(() => import('../pages/Skills'));
const PDI = lazy(() => import('../pages/PDI'));
/* PDI está fora do menu a pedido; estes três ficam vivos para a volta ser
   um descomentar, e não uma reimplementação. */
void PDI; void Target;
const Trilha = lazy(() => import('../pages/Trilha'));
const AVDPage = lazy(() => import('../pages/AVD'));
const Ciclos = lazy(() => import('../pages/Ciclos'));
const Calibragem = lazy(() => import('../pages/Calibragem'));
const Radar = lazy(() => import('../pages/Radar'));
const Relatorios = lazy(() => import('../pages/Relatorios'));
const EvolucaoLider = lazy(() => import('../pages/EvolucaoLider'));
const Importacoes = lazy(() => import('../pages/Importacoes'));
const Cadastros = lazy(() => import('../pages/Cadastros'));
const PessoaPerfil = lazy(() => import('../pages/PessoaPerfil'));
const Configuracoes = lazy(() => import('../pages/Configuracoes'));

export type RotaId =
  | 'painel' | 'squads' | 'pessoas' | 'preparo' | 'registros' | 'compromissos'
  | 'dna' | 'skills' | 'pdi' | 'trilha'  /* 'pdi' segue no tipo: a rota volta sem migração */
  | 'avd' | 'ciclos' | 'calibragem' | 'radar' | 'relatorios'
  | 'evolucao'
  | 'importacoes' | 'cadastros' | 'config';

type Grupo = 'Dia a dia' | 'Desenvolvimento' | 'Ciclo' | 'Você' | 'Operação';

interface Rota {
  id: RotaId;
  label: string;
  grupo: Grupo;
  icone: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: number;
  render: () => ReactNode;
}

const GRUPOS: Grupo[] = ['Dia a dia', 'Desenvolvimento', 'Ciclo', 'Você', 'Operação'];

export default function Shell() {
  const [rota, setRota] = useState<RotaId>('painel');

  /**
   * O perfil da pessoa é uma CAMADA por cima da rota, não uma rota.
   *
   * Você abre o perfil do Diego a partir do Painel, fecha, e volta para o
   * Painel exatamente onde estava. Se fosse rota, voltar exigiria reconstruir
   * de onde se veio — e a navegação para o perfil nasce de seis telas.
   */
  const [pessoa, setPessoa] = useState<string | null>(null);

  const navegacao: Navegacao = useMemo(() => ({
    ir: (r) => { setPessoa(null); setRota(r); },
    abrirPessoa: setPessoa,
    fecharPessoa: () => setPessoa(null),
  }), []);

  const vencidos = COMPROMISSOS.filter(
    (c) => c.status !== 'concluido' && c.prazoDate && diasEntre(c.prazoDate, HOJE) > 0).length;
  const naFila = ARQUIVOS.filter(
    (a) => a.status === 'pendente' || a.status === 'revisao_manual' || a.status === 'erro').length;
  const criticos = ALERTAS.filter((a) => a.severidade === 'critica').length;
  const semPDI = PESSOAS.filter(
    (p) => p.status === 'ativo' && !PDIS.some((x) => x.slug === p.slug)).length;
  const qasTravados = QAS.filter(
    (q) => q.progresso.some((p) => (p.diasParado ?? 0) > 40)).length;
  const buracosAVD = AVD.reduce(
    (s, a) => s + a.semEvidenciaComp.length + a.semEvidenciaDesemp.length, 0);
  const meusAbertos = ITENS.filter((i) => i.status === 'aberto').length;
  void semPDI;

  const rotas: Rota[] = [
    { id: 'painel', label: 'Painel', grupo: 'Dia a dia', icone: LayoutDashboard,
      render: () => <Painel ir={setRota} /> },
    { id: 'squads', label: 'Visão de times', grupo: 'Dia a dia', icone: Network,
      render: () => <SquadsPage /> },
    { id: 'pessoas', label: 'Pessoas', grupo: 'Dia a dia', icone: UserRound,
      render: () => <Pessoas /> },
    { id: 'preparo', label: 'Preparação de 1:1', grupo: 'Dia a dia', icone: MessagesSquare,
      render: () => <Preparo1a1 /> },
    { id: 'registros', label: 'Registros de 1:1', grupo: 'Dia a dia', icone: NotebookPen,
      render: () => <RegistrosPage /> },
    { id: 'compromissos', label: 'Compromissos', grupo: 'Dia a dia', icone: ListChecks,
      badge: vencidos, render: () => <Compromissos /> },

    { id: 'dna', label: 'DNA motivacional', grupo: 'Desenvolvimento', icone: HeartHandshake,
      render: () => <DNAPage /> },
    { id: 'skills', label: 'Matriz de skills', grupo: 'Desenvolvimento', icone: Grid3x3,
      render: () => <Skills /> },
    /* PDI fica fora do menu por ora, a pedido. A tela e os dados continuam
       no código — voltar é descomentar esta entrada, não reimplementar. */
    // { id: 'pdi', label: 'PDI', grupo: 'Desenvolvimento', icone: Target,
    //   badge: semPDI, render: () => <PDI /> },
    { id: 'trilha', label: 'Trilha QA → Dev', grupo: 'Desenvolvimento', icone: Route,
      badge: qasTravados, render: () => <Trilha /> },

    { id: 'avd', label: 'Ciclo AVD', grupo: 'Ciclo', icone: ClipboardCheck,
      badge: buracosAVD, render: () => <AVDPage /> },
    { id: 'ciclos', label: 'Ciclos de AVD', grupo: 'Ciclo', icone: CalendarRange,
      render: () => <Ciclos /> },
    { id: 'calibragem', label: 'Calibragem', grupo: 'Ciclo', icone: Scale,
      render: () => <Calibragem /> },
    { id: 'radar', label: 'Radar de alertas', grupo: 'Ciclo', icone: Siren,
      badge: criticos, render: () => <Radar /> },
    { id: 'relatorios', label: 'Relatórios', grupo: 'Ciclo', icone: FileText,
      render: () => <Relatorios /> },

    { id: 'evolucao', label: 'Evolução do líder', grupo: 'Você', icone: Compass,
      badge: meusAbertos, render: () => <EvolucaoLider /> },

    { id: 'importacoes', label: 'Importações', grupo: 'Operação', icone: FolderInput,
      badge: naFila, render: () => <Importacoes /> },
    { id: 'cadastros', label: 'Cadastros', grupo: 'Operação', icone: BookUser,
      render: () => <Cadastros /> },
    { id: 'config', label: 'Configurações', grupo: 'Operação', icone: Settings,
      render: () => <Configuracoes /> },
  ];

  const atual = rotas.find((r) => r.id === rota)!;

  return (
    <AppShell
      contentPadding={0}
      variant="elevated"
      sideNav={
        <SideNav
          header={<SideNavHeading heading="TeamControl" subheading="Gestão de time" />}
          collapsible={{ hasButton: true, buttonLabel: 'Recolher menu' }}
          resizable={{ defaultWidth: 248, minWidth: 200, maxWidth: 340,
                       autoSaveId: 'teamcontrol.sidenav' }}
        >
          {/*
            Seção, não item-pai desabilitado.
            Aninhar as rotas dentro de um item sem ícone fazia o menu recolhido
            ficar vazio: o que some ao recolher são os FILHOS. Com SideNavSection
            cada rota continua no nível raiz, e o ícone sobrevive ao recolhimento.
          */}
          {GRUPOS.map((g) => (
            <SideNavSection key={g} title={g}>
              {rotas.filter((r) => r.grupo === g).map((r) => (
                <SideNavItem
                  key={r.id}
                  label={r.label}
                  icon={r.icone}
                  isSelected={rota === r.id}
                  onClick={() => { setPessoa(null); setRota(r.id); }}
                  /* Pré-carrega o chunk no hover: quando o clique chega, já veio. */
                  onPointerEnter={() => precarregar(r.id)}
                  endContent={r.badge ? (
                    <Token size="sm" color={r.id === 'radar' ? 'red' : 'orange'}
                           label={String(r.badge)} />
                  ) : undefined}
                />
              ))}
            </SideNavSection>
          ))}
        </SideNav>
      }
    >
      <ProvedorNavegacao value={navegacao}>
        <Suspense fallback={<Carregando />}>
          {pessoa ? <PessoaPerfil slug={pessoa} /> : atual.render()}
        </Suspense>
      </ProvedorNavegacao>
    </AppShell>
  );
}

function Carregando() {
  return (
    <VStack hAlign="center" vAlign="center" minHeight={320} padding={6}>
      <Spinner label="Carregando a tela" />
    </VStack>
  );
}

const PRECARGA: Partial<Record<RotaId, () => Promise<unknown>>> = {
  squads: () => import('../pages/Squads'),
  pessoas: () => import('../pages/Pessoas'),
  preparo: () => import('../pages/Preparo1a1'),
  registros: () => import('../pages/Registros'),
  compromissos: () => import('../pages/Compromissos'),
  dna: () => import('../pages/DNA'),
  skills: () => import('../pages/Skills'),
  trilha: () => import('../pages/Trilha'),
  avd: () => import('../pages/AVD'),
  ciclos: () => import('../pages/Ciclos'),
  calibragem: () => import('../pages/Calibragem'),
  radar: () => import('../pages/Radar'),
  relatorios: () => import('../pages/Relatorios'),
  evolucao: () => import('../pages/EvolucaoLider'),
  importacoes: () => import('../pages/Importacoes'),
  cadastros: () => import('../pages/Cadastros'),
  config: () => import('../pages/Configuracoes'),
};

function precarregar(id: RotaId) {
  void PRECARGA[id]?.();
}
