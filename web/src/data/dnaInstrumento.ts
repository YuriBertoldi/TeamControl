/**
 * DNA Motivacional — o instrumento que você já aplica.
 *
 * GERADO por scripts/gerar-dna.cjs a partir de DNA MOTIVACIONAL_Modelo.xlsx.
 * Não editar à mão: rode o script de novo se a planilha mudar.
 *
 * São 21 pares de escolha forçada sobre três eixos binários, que produzem um
 * código de três letras e um dos oito perfis. O código é POSICIONAL — P|C,
 * depois E|V, depois I|E — e por isso a letra E significa coisas diferentes na
 * segunda e na terceira posição (Estabilidade e Exterioridade). Os polos têm
 * nome próprio aqui justamente para o código nunca depender dessa ambiguidade.
 *
 * UMA CORREÇÃO EM RELAÇÃO À PLANILHA MODELO: nos pares 3 e 9 a afirmativa de
 * recompensa externa está lançada na coluna de Estabilidade, não na de
 * Exterioridade. Pelo conteúdo o polo é Exterioridade, e com a correção cada
 * eixo fica com exatamente 7 pares (7+7+7=21) em vez de 7/8/6. Sem ela, duas
 * respostas sobre reconhecimento contaminam o eixo de necessidade e podem
 * inverter a segunda letra do código.
 *
 * TRAVA: nada daqui entra em justificativa de AVD nem em defesa de calibragem.
 * Motivação não é argumento de desempenho — src/data/insumo.ts exclui este
 * módulo por desenho, não por esquecimento.
 */

export type Polo =
  | "producao" | "conexao"
  | "estabilidade" | "variedade"
  | "interioridade" | "exterioridade";

export type EixoId = "impulso" | "necessidade" | "premio";

export interface Eixo {
  id: EixoId;
  nome: string;
  pergunta: string;
  polos: [Polo, Polo];
  /** Letra de cada polo no código de três letras, na ordem de `polos`. */
  letras: [string, string];
}

export const EIXOS: Eixo[] = [
  { id: "impulso", nome: "Impulso",
    pergunta: "O que mais move a pessoa: entregar resultado ou cuidar de gente?",
    polos: ["producao", "conexao"], letras: ["P", "C"] },
  { id: "necessidade", nome: "Necessidade",
    pergunta: "Do que ela precisa para render: previsibilidade ou variedade?",
    polos: ["estabilidade", "variedade"], letras: ["E", "V"] },
  { id: "premio", nome: "Prêmio",
    pergunta: "De onde vem a recompensa que conta: de dentro ou de fora?",
    polos: ["interioridade", "exterioridade"], letras: ["I", "E"] },
];

export const ROTULO_POLO: Record<Polo, string> = {
  producao: "Produção",
  conexao: "Conexão",
  estabilidade: "Estabilidade",
  variedade: "Variedade",
  interioridade: "Interioridade",
  exterioridade: "Exterioridade",
};

export interface Afirmativa { texto: string; polo: Polo }
export interface Par { n: number; opcoes: [Afirmativa, Afirmativa] }

/** Os 21 pares, na ordem da planilha. */
export const PARES: Par[] = [
  { n: 1, opcoes: [
    { polo: "conexao",
      texto: "Sou uma pessoa amigável, que apoia os outros e que procura intimidade com eles." },
    { polo: "producao",
      texto: "Sou uma pessoa preocupada com as conquistas; procuro ser bem-sucedido." },
  ] },
  { n: 2, opcoes: [
    { polo: "variedade",
      texto: "Tendo a ser espontâneo e gosto de arriscar." },
    { polo: "estabilidade",
      texto: "Tendo a ser metódico e cauteloso." },
  ] },
  { n: 3, opcoes: [
    { polo: "exterioridade",
      texto: "Quero ser recompensado por meu excelente trabalho." },
    { polo: "interioridade",
      texto: "Preciso de um trabalho que seja importante para mim." },
  ] },
  { n: 4, opcoes: [
    { polo: "conexao",
      texto: "Às vezes sou inseguro a meu respeito." },
    { polo: "producao",
      texto: "Às vezes confio demais em mim mesmo." },
  ] },
  { n: 5, opcoes: [
    { polo: "variedade",
      texto: "Gosto quando meu ritmo de vida é rápido, intenso e excitante." },
    { polo: "estabilidade",
      texto: "Gosto quando minha vida não é corrida, mas estável e tranquila." },
  ] },
  { n: 6, opcoes: [
    { polo: "exterioridade",
      texto: "Prefiro reconhecimento público a reconhecimento particular." },
    { polo: "interioridade",
      texto: "Prefiro reconhecimento particular a reconhecimento público." },
  ] },
  { n: 7, opcoes: [
    { polo: "estabilidade",
      texto: "Sou cuidadoso e tento estar pronto para imprevistos." },
    { polo: "variedade",
      texto: "Sou criativo e prefiro improvisar quando os problemas aparecem." },
  ] },
  { n: 8, opcoes: [
    { polo: "producao",
      texto: "Na maioria das vezes, gosto de liderar." },
    { polo: "conexao",
      texto: "Na maioria das vezes, prefiro que os outros liderem." },
  ] },
  { n: 9, opcoes: [
    { polo: "exterioridade",
      texto: "Sempre busquei um trabalho que tivesse potencial considerável de sucesso financeiro e reconhecimento pessoal." },
    { polo: "interioridade",
      texto: "Abriria mão de compensação financeira e reconhecimento pessoal para ter um trabalho que faça uma grande e positiva diferença." },
  ] },
  { n: 10, opcoes: [
    { polo: "conexao",
      texto: "Basicamente, sou tranquilo, aberto e flexível." },
    { polo: "producao",
      texto: "Basicamente, sou acelerado, assertivo e confiante." },
  ] },
  { n: 11, opcoes: [
    { polo: "exterioridade",
      texto: "Conseguir as melhores coisas da vida é extremamente importante para mim." },
    { polo: "interioridade",
      texto: "Conseguir as melhores coisas da vida não é importante para mim." },
  ] },
  { n: 12, opcoes: [
    { polo: "estabilidade",
      texto: "Tendo a ser concentrado e disciplinado." },
    { polo: "variedade",
      texto: "Tendo a ser impulsivo e ousado." },
  ] },
  { n: 13, opcoes: [
    { polo: "producao",
      texto: "Eu faço acontecer." },
    { polo: "conexao",
      texto: "O que tiver que ser será." },
  ] },
  { n: 14, opcoes: [
    { polo: "variedade",
      texto: "Não gosto de lidar com detalhes." },
    { polo: "estabilidade",
      texto: "Gosto de lidar com detalhes." },
  ] },
  { n: 15, opcoes: [
    { polo: "interioridade",
      texto: "Deixar uma contribuição para a humanidade é importante para mim." },
    { polo: "exterioridade",
      texto: "Conseguir riqueza e respeito é importante para mim." },
  ] },
  { n: 16, opcoes: [
    { polo: "conexao",
      texto: "Prefiro me encaixar a me destacar." },
    { polo: "producao",
      texto: "Prefiro me destacar a me encaixar." },
  ] },
  { n: 17, opcoes: [
    { polo: "estabilidade",
      texto: "Estou interessado em manter minha estabilidade e paz de espírito." },
    { polo: "variedade",
      texto: "Estou interessado em me desafiar fazendo coisas novas." },
  ] },
  { n: 18, opcoes: [
    { polo: "exterioridade",
      texto: "Em relação a um novo emprego, salário e benefícios são primordiais." },
    { polo: "interioridade",
      texto: "Em relação a um novo emprego, a função em si é primordial." },
  ] },
  { n: 19, opcoes: [
    { polo: "producao",
      texto: "Gosto de desafiar a ordem das coisas e sacudir as estruturas." },
    { polo: "conexao",
      texto: "Gosto de confortar as pessoas acalmá-las." },
  ] },
  { n: 20, opcoes: [
    { polo: "interioridade",
      texto: "Desde que eu esteja sendo verdadeiro comigo mesmo, não me importo com o que os outros pensam de mim." },
    { polo: "exterioridade",
      texto: "O que os outros pensam de mim é muito importante." },
  ] },
  { n: 21, opcoes: [
    { polo: "variedade",
      texto: "Uma das minhas maiores virtudes é lançar novas ideias, e com elas entusiasmar as pessoas." },
    { polo: "estabilidade",
      texto: "Uma das minhas maiores virtudes é implementar ideias e assegurar que os procedimentos sejam seguidos." },
  ] },
];

export interface Perfil {
  codigo: string;
  nome: string;
  descricao: string;
  motivadores: string[];
  desmotivadores: string[];
  dicas: string[];
}

export const PERFIS: Perfil[] = [
  {
    codigo: "PEI",
    nome: "Diretor",
    descricao:
      "Diretores são pensadores estratégicos com a habilidade de fazer os projetos avançarem. Prestam atenção aos detalhes e não importam de botar a mão na massa. Diretores são práticos e responsáveis. Objetivos, gostam de ir direto ao ponto. Estão centrados em suas tarefas e são hábeis em solucionar problemas. São bons com programações, sistemas e organização. Focam nas conquistas e valorizam resultados. Diretores atingem bons resultados em organizações que lhe deem alguma autonomia. Sabem que agregam valor a suas empresas e precisam sentir-se genuinamente apreciados por suas contribuições. Diretores acreditam que possuem missões a cumprir e querem oferecer uma contribuição positiva com seu trabalho.",
    motivadores: [
      "Liberdade em relação a restrições desnecessárias",
      "possibilidade de administrar o próprio tempo",
      "reconhecimento de seus colegas e parceiros",
      "oportunidade de crescimento pessoal",
      "estruturas organizadas",
      "obtenção de feedback específico e positivo",
    ],
    desmotivadores: [
      "Metas confusas",
      "colegas que não cumprem a parte do trabalho que lhes cabe",
      "trabalho em equipe",
      "impossibilidade de administrar o próprio tempo e encontrar as próprias soluções",
    ],
    dicas: [
      "Metas fracas não inspiram os diretores. Defina metas que sejam importantes e desafiadoras.",
      "Você é estimulado pelo desafio. Se a oportunidade surgir, compita. Mas tenha a certeza de que está competindo por algo que é importante para você. Por exemplo, se quer entra em forma, treine para uma corrida que ajudará sua instituição de caridade preferida.",
      "Manter a integridade e estabelecer responsabilidades ajudará a atingir seus objetivos. Elabore um plano que proporcione uma rotina estável e que faça você caminhar todos os dias rumo ao seu objetivo. Então, siga esse plano. Usar ferramentas como lembretes e calendários lhe ajudará a ser responsável e lhe dará estímulo a mais para entrar em ação.",
    ],
  },
  {
    codigo: "PVI",
    nome: "Visionário",
    descricao:
      "Visionários são persistentes, cheios de energia e confiantes. São capazes de organizar pessoas e projetos. Possuem forte potencial de liderança e reagem rapidamente a crises. Pensadores criativos, os visionários são capazes de desenvolver uma percepção própria e fazer com que os outros se animem com ela. Gostam de trabalhar em vários projetos ao mesmo tempo e de explorar conceitos alternativos. Enxergam longe e possuem grande imaginação, por isso são bons em encontrar soluções originais para problemas difíceis. Visionários gostam de mudanças e funcionam bem sob pressão. Eles têm capacidade de fazer manobras em espaços limitados. Confiam em sua capacidade de aprender coisas novas. Os visionários gostam de mudanças e desejam crescimento pessoal. Gostam de saber a importância do seu trabalho e desejam ir “onde ninguém esteve antes”.",
    motivadores: [
      "Ambiente de trabalho inspirador",
      "oportunidade de ter e concretizar ideias",
      "respeito dos companheiros",
      "crédito pelo trabalho feito e um forte senso de missão a ser cumprida",
    ],
    desmotivadores: [
      "Estruturas rígidas",
      "rotina monótona",
      "atrasos",
      "detalhes que desperdiçam tempo e burocracia",
    ],
    dicas: [
      "É essencial que você tenha opções. Faça uma lista com dez formas de atingir seus objetivos. Depois, misture-as. Faça um pouquinho de cada coisa. Os visionários cansam-se rapidamente das trivialidades.",
      "Crie um plano específico para atingir suas metas. Se algo não funciona para você, não se force a fazer – esqueça-o. Encontre um caminho melhor – algo mais prazeroso ou empolgante.",
      "Esmiúce os motivos de sua meta ser importante pra você. Você (e os outros) vai lucrar se seu objetivo for atingido? Quais serão as consequências de não alcançá-lo?",
    ],
  },
  {
    codigo: "PEE",
    nome: "Chefe",
    descricao:
      "Chefes desejam intensamente resultados tangíveis alinhados a uma necessidade de precisão. Eles são determinados e fortes. São independentes e capazes de trabalhar sem supervisão, atingindo bons resultados. Os chefes podem tomar decisões rápidas, mas preferem fazer isso reunindo todas as informações. Gostam de ter autoridade para determinar seus próprios caminhos. Possuem excepcional capacidade de organização e conseguem desenvolver facilmente sistemas e procedimentos. Os chefes sentem-se valorizados e apreciados ao receber benefícios tangíveis. Trabalham metodicamente rumo a objetivos que ofereçam recompensas significativas e concretas. Gostam da sensação de “missão cumprida” e necessitam atingir objetivos específicos.",
    motivadores: [
      "Autonomia",
      "reconhecimento público",
      "privilégios especiais",
      "liberdade em relação a restrições desnecessárias",
      "possibilidade de estruturar seu ambiente como quiserem",
      "tempo para pensar",
      "poder de ação e reconhecimento de suas habilidades especiais e conquistas",
    ],
    desmotivadores: [
      "Rigidez ou controle de supervisores ou de outras figuras de autoridade",
      "sistemas ineficientes",
      "pessoas ineficientes",
    ],
    dicas: [
      "Constância é essencial para seu tipo motivacional. É melhor dar um passo pequeno rumo a seu objetivo a cada dia do que parar e recomeçar o tempo todo.",
      "Defina claramente seu objetivo; quebre-o em pequenas partes administráveis e defina um prazo para completá-las.",
      "Desde o início, planeje recompensas para as metas excedentes – recompensas que sejam significativas e altamente desejadas.",
    ],
  },
  {
    codigo: "PVE",
    nome: "Campeão",
    descricao:
      "Campeões gostam de desafios e adoram vencer. São líderes envolventes e entusiásticos. Possuem uma capacidade de persuasão natural. Não se importam em ser o centro das atenções e são bons em trabalhar com os outros enquanto desenvolvem as próprias ideias. Campeões tendem a ser sedutores e carismáticos. São hábeis em fazer as coisas acontecerem, apesar de obstáculos aparentemente insuperáveis. Na verdade, os obstáculos só tornam as tarefas mais interessantes para os campeões. Tomam decisões rapidamente e podem ser impacientes com aqueles que não agem dessa forma. Como bons negociadores, os campeões querem a promessa de que o trabalho será feito. Campeões possuem uma capacidade inata de fazer os outros seguirem sua liderança.",
    motivadores: [
      "Compromissos desafiadores",
      "autoridade para tomar decisões",
      "vantagens",
      "liberdade",
      "oportunidades de crescimento",
      "prazos",
      "riscos calculados e popularidade",
    ],
    desmotivadores: [
      "Controle rígido",
      "incapacidade de administrar o próprio tempo e projetos",
      "análises demoradas",
      "debates infrutíferos",
    ],
    dicas: [
      "Seu tipo motivacional gosta de estar ocupado. É fundamental que você crie espaço na sua agenda para se dedicar exclusivamente a fazer o necessário para atingir seus objetivos. O tempo não vai aparecer num passe de mágica. Você deve reservar horários para trabalhar em suas próprias metas.",
      "Competição e recompensas proporcionais são poderosos motivadores para o seu tipo. Desenvolva uma competição com pessoas que pensem como você e que tenham o mesmo objetivo. O primeiro a atingir a meta leva o prêmio.",
      "Faça com que o processo seja prazeroso. Invista o tempo que precisar para encontrar formas divertidas de atingir sua meta.",
    ],
  },
  {
    codigo: "CEI",
    nome: "Sustentador",
    descricao:
      "Sustentadores são práticos, confiáveis e leais. São voltados ao mesmo tempo para pessoas e detalhes. São supervisores por natureza. Eles são bons em ajudar os outros a serem os melhores em suas posições e lutam pelos mais fracos. São metódicos no seu trabalho e gostam de reunir as informações necessárias antes de agir. Respeitam a autoridade e a estrutura da organização. São preocupados e cuidadosos com pessoas e projetos e hábeis em implementar procedimentos. Possuem uma forte ética de trabalho. Ter uma meta claramente definida é importante para eles, que seguem conscientemente rumo a seus objetivos. Recompensas psicológicas são fundamentais para eles. Precisam sentir-se bem em relação ao que fazem e sentir que seu trabalho traz contribuições positivas.",
    motivadores: [
      "Fatos e informações",
      "Respeito dos colegas",
      "a admiração sincera",
      "reconhecimento privado",
      "feedback positivo e específico",
      "ambiente de trabalho estimulante",
      "colegas de trabalho dos quais gostem",
      "objetivos claramente definidos",
      "sensação de dever cumprido",
      "tempo para refletir e planejar",
    ],
    desmotivadores: [
      "Excesso e exagero",
      "interferência no campo pessoal e familiar",
      "injustiças",
      "demanda por mudanças rápidas",
    ],
    dicas: [
      "Seu tipo motivacional pode sentir-se desencorajado por objetivos muito ambiciosos. Por isso, esteja certo de que suas aspirações são alcançáveis. Defina metas administráveis que possam ser atingidas num tempo razoável.",
      "Seja generoso consigo mesmo. Não espere a perfeição. Progrida “devagar e sempre”.",
      "Envolva os outros. Faça uma lista de pessoas, organizações e recursos que o ajudem a atingir seu objetivo. Sustentadores atingem seu potencial quando trabalham em prol de uma meta individual e coletiva com outros igualmente comprometidos com essa conquista.",
    ],
  },
  {
    codigo: "CVI",
    nome: "Relacionador",
    descricao:
      "Relacionadores são gentis e criativos. Eles saboreiam a vida e tratam os outros com carinho. São simpáticos, amigáveis e queridos. São cheios de recursos e inventivos, capazes de chegar a acordos para que o trabalho seja feito. São aqueles jogadores que trazem à tona o melhor do seu time. Calorosos e entusiasmados, equilibram preocupação com os outros e um zelo pelo crescimento pessoal. Relacionadores são afetivos e práticos ao abordar a solução de problemas. Possuem uma habilidade inata para criar soluções e fazer com que todos saiam ganhando. Valorizam o que é realmente importante e desejam contribuir positivamente para a sociedade. Unem lealdade a aventura, sendo amigos divertidos e parceiros dedicados.",
    motivadores: [
      "Admiração verdadeira pelo trabalho bem feito",
      "oportunidades de crescimento pessoal",
      "colegas de trabalho divertidos",
      "trabalho em equipe",
      "novas experiências",
      "ambiente de trabalho estimulante",
    ],
    desmotivadores: [
      "Isolamento",
      "rotinas rígidas",
      "prazos apertados",
      "falta de criatividade",
      "desaprovação e conflitos",
    ],
    dicas: [
      "Já que você gosta de gente, a melhor forma de atingir seus objetivos é colaborar com um parceiro ou um grupo de pessoas que compartilhem da mesma meta. Encontre ou crie um grupo de apoio que o estimule a atingir seu objetivo.",
      "Persistência é um desafio para o seu estilo motivacional. Você deve se comprometer com seu objetivo e fazer um pouco a cada dia, não importa o quão pouco pareça levá-lo para mais perto do seu alvo.",
      "Dedique um tempo para olhar para dentro de si e pergunte-se por que seu objetivo é importante. Escreva as razões e recorra a elas com frequência. É o “por que”, não o “como”, que inspira seu tipo motivacional.",
    ],
  },
  {
    codigo: "CEE",
    nome: "Refinador",
    descricao:
      "Refinadores são pensadores sistemáticos e precisos. Possuem a capacidade de enxergar o todo e de prestar atenção também aos detalhes. Refinadores são cuidadosos e disciplinados. Apoiam e respeitam os outros. Afetivos e práticos, os refinadores se importam com a família. São extremamente leais e possuem um senso bem definido do certo e do errado. Preferem um estilo “democrático” de liderança e esperam que os outros sigam as regras. Refinadores são confiáveis e aplicados. Recompensas justas e admiração sincera por seu trabalho fazem com que se sintam valorizados. Seu processo de tomada de decisões é permeado por debates, pois querem garantir que suas escolhas não afetem negativamente os outros.",
    motivadores: [
      "Dispor de todas as informações e de tempo suficiente para analisá-las",
      "companheiros de equipe competentes",
      "reconhecimento dos superiores",
      "privilégios",
      "liberdade",
      "respeito genuíno",
    ],
    desmotivadores: [
      "Prazos muito apertados",
      "excessos",
      "mudanças rápidas",
      "interferências no tempo pessoal ou familiar e visíveis injustiças",
    ],
    dicas: [
      "Seu estilo motivacional atinge seu máximo quando você é orientado por um mentor. Entreviste pessoas que já tenham conquistado o mesmo sonho e descubra como elas fizeram isso. Peça a elas para lhe ajudarem e aconselharem quando você se depara com problemas.",
      "Não mergulhe numa tarefa importante sem antes cumprir com suas responsabilidades. Procure a forma ideal de atingir seu objetivo. Há uma maneira melhor – encontre-a.",
      "Separe semanalmente uma boa quantia em dinheiro para que você possa gastar como recompensa caso realize seu objetivo a tempo.",
    ],
  },
  {
    codigo: "CVE",
    nome: "Explorador",
    descricao:
      "Exploradores são alegres e espontâneos, amantes da aventura. São perspicazes, criteriosos e muito bons em decifrar pessoas. Calorosos, atenciosos e compreensivos, os exploradores se sobressaem em público. Trazem à tona o melhor dos outros ao encorajá-los e por eles demonstrar admiração. Resolvem problemas com criatividade e são hábeis em encontrar soluções criativas. Exploradores encorajam a cooperação e são bons em fazer os outros colaborarem. Valorizam o trabalho duro, mas querem que seu trabalho seja divertido e compensador. Exploradores gostam de trabalhos que lhes possibilitem aprender coisas novas e conhecer novas pessoas.",
    motivadores: [
      "Relacionamentos estimulantes",
      "oportunidades de crescimento pessoal e profissional",
      "liberdade para fazer as coisas do seu jeito",
      "estima",
      "boas compensações e bônus",
    ],
    desmotivadores: [
      "Rotina",
      "burocracia",
      "isolamento",
      "desaprovação e falta de criatividade",
    ],
    dicas: [
      "Camaradagem é a chave para seu tipo motivacional. Envolver os outros vai ajudá-lo a se manter estimulado rumo ao seu objetivo. Até a mais chata das tarefas será divertida quando as pessoas de quem você gosta fazem parte do plano.",
      "Exploradores precisam de escolhas. Sempre há mais de uma forma de atingir um objetivo. Crie uma enorme lista com soluções que funcionaram para outras pessoas e ouse tentar cada uma delas.",
      "Recompense-se ao longo do caminho. Celebre mesmo os seus menores sucessos e ostente uma grande recompensa quando cumprir uma meta.",
    ],
  },
];
