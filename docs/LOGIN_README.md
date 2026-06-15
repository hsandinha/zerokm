# 🚗 Zero KM - Sistema Nacional de Vendas

Uma tela de login moderna e responsiva para o sistema nacional de vendas de carros zero quilômetro.

## ✨ Características

### 🎨 Design Moderno
- **Layout dividido**: Formulário à esquerda, vídeo à direita
- **Gradientes animados**: Efeitos visuais impressionantes
- **Design responsivo**: Funciona em todos os dispositivos
- **Animações CSS**: Transições suaves e elegantes

### 👥 Perfis de Usuário
O sistema suporta 4 tipos de usuários:

1. **🏢 Concessionária**: Acesso ao painel de vendas
2. **👤 Operador**: Interface de operações
3. **⚙️ Administrador**: Painel administrativo completo
4. **🚗 Cliente**: Portal do cliente

### 🎬 Vídeo Background
- **Rotação automática**: Alterna entre diferentes tipos de carros
- **Tipos de vídeo**:
  - Carros Esportivos
  - Carros de Corrida  
  - Carros do Dia a Dia
- **Fallback animado**: Animação CSS quando vídeos não carregam
- **Controles interativos**: Indicadores clicáveis

## 🚀 Como Executar

1. **Instale as dependências**:
   \`\`\`bash
   npm install
   \`\`\`

2. **Execute o servidor de desenvolvimento**:
   \`\`\`bash
   npm run dev
   \`\`\`

3. **Acesse a aplicação**:
   - Aplicação: http://localhost:3000
   - **Tela de Login**: http://localhost:3000/login

## 📱 Funcionalidades da Tela de Login

### Formulário Inteligente
- ✅ Validação em tempo real
- 🔐 Toggle para mostrar/esconder senha
- 💾 Opção "Lembrar-me"
- 🔗 Link "Esqueci minha senha"

### Seleção de Perfil
Interface visual para escolher o tipo de usuário com ícones e cores distintas.

### Autenticação Social
- 🔗 Login com Google (preparado para implementação)
- 🔒 Integração com OAuth (estrutura pronta)

## 🎨 Tecnologias

- **Next.js 14**: Framework React moderno
- **TypeScript**: Tipagem estática
- **CSS Modules**: Estilos isolados e performáticos
- **Responsive Design**: Mobile-first approach

## 📁 Estrutura de Arquivos

\`\`\`
app/login/
├── layout.tsx          # Layout específico do login
├── page.tsx           # Página principal de login
└── page.module.css    # Estilos da página

components/login/
├── LoginForm.tsx           # Componente do formulário
├── LoginForm.module.css    # Estilos do formulário
├── VideoBackground.tsx     # Componente de vídeo
└── VideoBackground.module.css # Estilos do vídeo

lib/types/
└── auth.ts            # Tipos TypeScript
\`\`\`

## 🔧 Customização

### Adicionar Vídeos Reais
Para usar vídeos reais, coloque os arquivos MP4 em:
\`\`\`
public/videos/
├── supercar.mp4
├── racing.mp4
└── daily.mp4
\`\`\`

### Modificar Cores
Edite as variáveis CSS nos arquivos de estilo:
- **Gradiente principal**: \`#00d4ff\` → \`#0066ff\` → \`#8a2be2\`
- **Cores de destaque**: Personalize nos arquivos \`.module.css\`

## 📋 Próximos Passos

1. **Implementar autenticação real** com JWT/OAuth
2. **Criar dashboards específicos** para cada tipo de usuário
3. **Integrar com API backend** para validação
4. **Adicionar mais animações** e micro-interações
5. **Implementar recuperação de senha** funcional

## 🚀 Deploy

Para deploy em produção:
\`\`\`bash
npm run build
npm start
\`\`\`

---

**Desenvolvido com ❤️ para o futuro das vendas automotivas**