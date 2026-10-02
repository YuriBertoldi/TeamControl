/**
 * Configurações — tudo que é caminho, limiar ou cadência mora aqui.
 *
 * Nada disso fica fixo no código. A precedência está documentada em
 * src/config.ts: tela > variável de ambiente > padrão.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { FolderPlus, RotateCcw, Save } from 'lucide-react';

import { Page } from '../app/ui';
import {
  carregarConfig, salvarConfig, limparConfig, CONFIG_PADRAO, type Config, type PastaMonitorada,
} from '../config';

export default function Configuracoes() {
  const [cfg, setCfg] = useState<Config>(carregarConfig);
  const [salvo, setSalvo] = useState(false);

  const mudar = <K extends keyof Config>(k: K, v: Config[K]) => {
    setCfg({ ...cfg, [k]: v });
    setSalvo(false);
  };

  const mudarPasta = (id: string, patch: Partial<PastaMonitorada>) => {
    mudar('pastas', cfg.pastas.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const adicionarPasta = () => {
    mudar('pastas', [...cfg.pastas, {
      id: `pasta-${Date.now()}`, caminho: '', rotulo: 'Nova pasta', ativa: false, ignorar: [],
    }]);
  };

  const salvar = () => { salvarConfig(cfg); setSalvo(true); };
  const restaurar = () => { limparConfig(); setCfg(CONFIG_PADRAO); setSalvo(false); };

  return (
    <Page
      titulo="Configurações"
      subtitulo="Caminhos, cadências e limiares — nada fixo no código"
      acoes={
        <>
          <Button icon={<Save size={14} />} label="Salvar" variant="primary" onClick={salvar} />
          <Button icon={<RotateCcw size={14} />} label="Restaurar padrão" variant="ghost" onClick={restaurar} />
        </>
      }
    >
      {salvo && (
        <Banner status="success" title="Configuração salva"
                description="Vale para esta máquina. No sistema, isto grava na tabela de configuração do tenant."
                isDismissable onDismiss={() => setSalvo(false)} />
      )}

      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>Pastas monitoradas</Heading>
            <Button icon={<FolderPlus size={14} />} size="sm" variant="ghost" label="Adicionar pasta" onClick={adicionarPasta} />
          </HStack>
          <Text type="supporting">
            A varredura é por polling com hash, não fsnotify — bind mount do Docker no Windows não
            propaga inotify de forma confiável. O Google Drive entra aqui como unidade montada pelo
            Drive para Desktop, sem OAuth.
          </Text>

          <VStack gap={3}>
            {cfg.pastas.map((p) => (
              <Card key={p.id} padding={2} variant="muted">
                <VStack gap={1.5}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <StatusDot variant={p.ativa ? 'success' : 'neutral'}
                               label={p.ativa ? 'Ativa' : 'Inativa'} />
                    <TextInput label="Rótulo" size="sm" value={p.rotulo}
                               onChange={(v) => mudarPasta(p.id, { rotulo: v })} />
                    <Switch label="Monitorar" value={p.ativa}
                            onChange={(v) => mudarPasta(p.id, { ativa: v })} />
                  </HStack>
                  <TextInput
                    label="Caminho absoluto" value={p.caminho}
                    placeholder="C:\\caminho\\da\\pasta"
                    onChange={(v) => mudarPasta(p.id, { caminho: v })}
                    description={p.ignorar.length
                      ? `Ignora: ${p.ignorar.join(', ')}`
                      : 'Nenhuma subpasta ignorada'}
                  />
                </VStack>
              </Card>
            ))}
          </VStack>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Ingestão</Heading>
          <HStack gap={2} wrap="wrap" vAlign="start">
            <NumberInput
              label="Intervalo de varredura (segundos)" value={cfg.intervaloVarreduraSeg}
              onChange={(v) => mudar("intervaloVarreduraSeg", v)} min={5} max={3600}
            />
            <TextInput
              label="Nome do coordenador" value={cfg.nomeCoordenador}
              onChange={(v) => mudar('nomeCoordenador', v)}
              description="Usado para separar você dos participantes no cabeçalho da transcrição"
            />
          </HStack>
          <HStack gap={1} wrap="wrap" vAlign="center">
            <Text type="label">Extensões aceitas</Text>
            {cfg.extensoes.map((e) => <Token key={e} size="sm" color="blue" label={e} />)}
          </HStack>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Export e versionamento</Heading>
          <TextInput
            label="Pasta do repositório de dados" value={cfg.pastaExport}
            onChange={(v) => mudar('pastaExport', v)}
            description="Repositório git privado e local. Níveis privado e restrito nunca saem para o disco."
          />
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Limiares</Heading>
          <HStack gap={2} wrap="wrap" vAlign="start">
            <NumberInput label="Cadência de 1:1 (dias)" value={cfg.cadenciaDias}
                         onChange={(v) => mudar("cadenciaDias", v)} min={7} max={120} />
            <NumberInput label="Folga antes do alerta (dias)" value={cfg.folgaCadenciaDias}
                         onChange={(v) => mudar("folgaCadenciaDias", v)} min={0} max={30} />
            <NumberInput label="Meses mínimos para a AVD" value={cfg.mesesMinimosAVD}
                         onChange={(v) => mudar("mesesMinimosAVD", v)} min={0} max={24} />
          </HStack>
          <Text type="supporting">
            Com {cfg.cadenciaDias} + {cfg.folgaCadenciaDias} dias, o alerta de 1:1 atrasada dispara
            em {cfg.cadenciaDias + cfg.folgaCadenciaDias} dias. O corte de {cfg.mesesMinimosAVD} meses
            é o que hoje deixa Gabriela e Nelson fora do ciclo.
          </Text>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>De onde cada valor vem</Heading>
          <Divider />
          <List density="compact" hasDividers>
            <ListItem label="Tela de Configurações"
                      startContent={<StatusDot variant="success" label="Prioridade 1" />}
                      description={<Text type="supporting">
                        Vence tudo. Hoje grava no navegador; no sistema, na tabela do tenant.
                      </Text>} />
            <ListItem label="Variável de ambiente (.env)"
                      startContent={<StatusDot variant="accent" label="Prioridade 2" />}
                      description={<Text type="supporting">
                        VITE_PASTA_REGISTROS · VITE_PASTA_DRIVE · VITE_PASTA_EXPORT ·
                        VITE_INTERVALO_VARREDURA · VITE_COORDENADOR
                      </Text>} />
            <ListItem label="Padrão do código"
                      startContent={<StatusDot variant="neutral" label="Prioridade 3" />}
                      description={<Text type="supporting">
                        src/config.ts — usado quando nenhum dos anteriores define o valor.
                      </Text>} />
          </List>
        </VStack>
      </Card>
    </Page>
  );
}
