# Vídeos para a Tela de Login

## 📹 Vídeos do Pixabay

Para implementar os vídeos reais, baixe os seguintes arquivos do Pixabay e coloque nesta pasta:

### 1. Carro de Luxo (luxury-car.mp4)
- **URL**: https://pixabay.com/pt/videos/carro-luzes-luxo-autom%c3%b3vel-181537/
- **Descrição**: Elegância e sofisticação - veículos premium com acabamento refinado

### 2. Carro Clássico (classic-car.mp4)  
- **URL**: https://pixabay.com/pt/videos/autom%c3%b3vel-preto-carro-antigo-24388/
- **Descrição**: Tradição e história - modelos atemporais com design icônico

### 3. Supercarro (supercar.mp4)
- **URL**: https://pixabay.com/pt/videos/ai-gerado-carro-esporte-super-carro-256065/
- **Descrição**: Potência e performance - tecnologia de ponta e máxima velocidade

## 🔧 Como Adicionar os Vídeos

### **Passo a Passo Detalhado:**

1. **Acesse cada URL do Pixabay:**
   - Clique no link do vídeo
   - Clique no botão "Download Gratuito"
   - Escolha a qualidade "Large" (recomendado)
   - Baixe o arquivo MP4

2. **Renomeie os arquivos:**
   - Vídeo 1 → `luxury-car.mp4`
   - Vídeo 2 → `classic-car.mp4` 
   - Vídeo 3 → `supercar.mp4`

3. **Coloque nesta pasta:**
   - Copie os 3 arquivos para `public/videos/`
   - Certifique-se que os nomes estão corretos

4. **Reinicie o servidor:**
   ```bash
   npm run dev
   ```

5. **Acesse a tela de login:**
   - `http://localhost:3000/login`
   - Os vídeos aparecerão automaticamente!

## 📱 Funcionalidade Atual

Mesmo sem os vídeos, o sistema já funciona perfeitamente com:
- ✅ Gradientes animados como fallback
- ✅ Rotação automática entre os 3 tipos
- ✅ Indicadores interativos
- ✅ Contador de vídeos
- ✅ Informações detalhadas de cada tipo
- ✅ Design totalmente responsivo