import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Setup obrigatório do Astryx — sem estes dois imports os componentes
// renderizam sem estilo nenhum.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

import { Theme } from '@astryxdesign/core/theme';
import './themes/padrao/fundo.css';
import { temaPadrao } from './themes/padrao/temaPadrao';
import { conectar } from './data/origem';

/**
 * Busca o estado do banco ANTES de montar a aplicação.
 *
 * O import do Shell é dinâmico de propósito: os módulos de dado leem o cache
 * em tempo de carga (`export const PESSOAS = carregarPessoas()`). Com import
 * estático eles seriam avaliados antes de `conectar()` terminar, e a primeira
 * tela nasceria com o cache velho — ou vazia, na primeira execução.
 *
 * Se a API não responder, a subida segue com o que estiver no navegador. O
 * sistema é local e o backend pode simplesmente não ter sido iniciado.
 */
async function iniciar() {
  await conectar();

  const { default: Shell } = await import('./app/Shell');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Theme theme={temaPadrao} mode="dark">
        <Shell />
      </Theme>
    </StrictMode>,
  );
}

void iniciar();
