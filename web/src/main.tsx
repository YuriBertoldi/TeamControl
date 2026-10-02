import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Setup obrigatório do Astryx — sem estes dois imports os componentes
// renderizam sem estilo nenhum.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

import { Theme } from '@astryxdesign/core/theme';
import './themes/padrao/fundo.css';
import { temaPadrao } from './themes/padrao/temaPadrao';
import Shell from './app/Shell';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={temaPadrao} mode="dark">
      <Shell />
    </Theme>
  </StrictMode>,
);
