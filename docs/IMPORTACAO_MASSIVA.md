# 📊 Guia de Importação Massiva

Este documento descreve o formato correto dos arquivos CSV para importação massiva de dados no sistema Zero KM.

---

## 📦 Importação de Modelos

### Colunas Necessárias (na ordem exata):

1. **Marca** - Nome da marca do veículo (obrigatório)
2. **Modelo** - Nome do modelo do veículo (obrigatório)

### Formato do Arquivo CSV:

```csv
Marca,Modelo
TOYOTA,COROLLA
FORD,FOCUS
HONDA,CIVIC
CHEVROLET,ONIX
VOLKSWAGEN,GOL
```

### Regras de Validação:

- ✅ Primeira linha deve conter os cabeçalhos: `Marca,Modelo`
- ✅ Ambos os campos são **obrigatórios**
- ✅ Os valores serão automaticamente convertidos para MAIÚSCULAS
- ✅ Linhas vazias são ignoradas
- ⚠️ Linhas com dados incompletos geram erro e são ignoradas

### Localização no Sistema:
- **Tela:** Dashboard Operador > Tabelas > Modelos
- **Botão:** 📂 Importar CSV

---

## 🚗 Importação de Veículos

### Colunas Necessárias (na ordem exata):

1. **marca** - Marca do veículo (obrigatório)
2. **modelo** - Modelo do veículo (obrigatório)
3. **versao** - Versão/acabamento (opcional)
4. **cor** - Cor do veículo (opcional)
5. **preco** - Preço base em reais (opcional, usar números sem pontos/vírgulas)
6. **concessionaria** - Nome da concessionária (obrigatório)
7. **cidade** - Cidade onde está o veículo (obrigatório)
8. **estado** - Estado (UF) onde está o veículo (obrigatório)
9. **vendedor** - Nome do vendedor responsável (obrigatório)
10. **telefone** - Telefone de contato (obrigatório)

### Formato do Arquivo CSV:

```csv
marca,modelo,versao,cor,preco,concessionaria,cidade,estado,vendedor,telefone
TOYOTA,COROLLA,XEI 2.0,Prata,95000,Concessionária Toyota SP,São Paulo,SP,João Silva,(11) 98765-4321
FORD,FOCUS,SE 1.6,Branco,75000,Ford Premium,Campinas,SP,Maria Santos,(19) 99876-5432
HONDA,CIVIC,EXL 2.0,Preto,120000,Honda Elite,Rio de Janeiro,RJ,Pedro Costa,(21) 97654-3210
CHEVROLET,ONIX,LTZ 1.4,Vermelho,65000,Chevrolet Master,Belo Horizonte,MG,Ana Paula,(31) 96543-2109
VOLKSWAGEN,GOL,1.0 FLEX,Azul,45000,VW Center,Curitiba,PR,Carlos Mendes,(41) 95432-1098
```

### Regras de Validação:

- ✅ Primeira linha deve conter os cabeçalhos exatos
- ✅ **Campos obrigatórios:** marca, modelo, concessionaria, cidade, estado, vendedor, telefone
- ✅ **Campos opcionais:** versao, cor, preco
- ✅ Total de **10 colunas** devem estar presentes
- ✅ Linhas vazias são ignoradas
- ⚠️ Linhas com menos de 10 colunas geram erro
- ⚠️ Linhas com campos obrigatórios em branco geram erro

### Campos Detalhados:

| Campo | Tipo | Obrigatório | Exemplo | Observações |
|-------|------|-------------|---------|-------------|
| marca | Texto | ✅ Sim | TOYOTA | Convertido para maiúsculas |
| modelo | Texto | ✅ Sim | COROLLA | Convertido para maiúsculas |
| versao | Texto | ❌ Não | XEI 2.0 | Pode ficar vazio |
| cor | Texto | ❌ Não | Prata | Pode ficar vazio |
| preco | Número | ❌ Não | 95000 | Sem pontos ou vírgulas |
| concessionaria | Texto | ✅ Sim | Concessionária Toyota SP | Nome completo |
| cidade | Texto | ✅ Sim | São Paulo | Nome da cidade |
| estado | Texto | ✅ Sim | SP | Sigla do estado (UF) |
| vendedor | Texto | ✅ Sim | João Silva | Nome completo |
| telefone | Texto | ✅ Sim | (11) 98765-4321 | Com ou sem formatação |

### Localização no Sistema:
- **Tela:** Dashboard Operador > Consulta de Veículos
- **Botão:** 📂 Importar CSV

---

## 🎯 Boas Práticas

### Preparação do Arquivo:

1. **Use um editor de planilhas** (Excel, Google Sheets, LibreOffice)
2. **Salve como CSV UTF-8** para evitar problemas com acentos
3. **Não use ponto e vírgula (;)** como separador - use apenas vírgula (,)
4. **Remova vírgulas** do conteúdo dos campos (ex: preço formatado)
5. **Teste com poucas linhas** primeiro antes de importar tudo

### Durante a Importação:

- ✅ A barra de progresso mostra o andamento
- ✅ Ao final, você verá o número de sucessos e erros
- ✅ Clique em "Ver erros" para identificar problemas específicos
- ✅ Corrija os erros e reimporte apenas as linhas com problema

### Tratamento de Erros:

Cada erro mostrará:
- Número da linha onde ocorreu o erro
- Descrição do problema (dados incompletos, campos faltando, etc.)
- Valores que causaram o erro

**Exemplo de erro:**
```
Linha 15: Dados insuficientes - esperado 10 colunas, encontradas 8
Linha 23: Campos obrigatórios em branco
Linha 45: Erro ao adicionar FIAT UNO: [detalhes do erro]
```

---

## 🔧 Implementação Técnica

### Serviço: `tablesService.ts`

#### Método: `importModelosFromCSV()`
```typescript
// Localização: lib/services/tablesService.ts (linha 264)
async importModelosFromCSV(
    csvData: string,
    onProgress?: (current: number, total: number) => void
): Promise<{ success: number; errors: string[] }>
```

#### Método: `importVeiculosFromCSV()`
```typescript
// Localização: lib/services/tablesService.ts (linha 312)
async importVeiculosFromCSV(
    csvData: string,
    onProgress?: (current: number, total: number) => void
): Promise<{ success: number; errors: string[] }>
```

### Componentes de UI:

- **Modelos:** `components/operator/ModelosTable.tsx` (linha 339)
- **Veículos:** `components/operator/VehicleConsultation 2.tsx` (linha 516)

---

## ❓ Perguntas Frequentes

**Q: Posso importar veículos sem ter cadastrado as marcas e modelos antes?**  
A: Sim, mas é recomendável cadastrar marcas e modelos primeiro para padronização.

**Q: O que acontece se eu tentar importar um modelo que já existe?**  
A: O sistema tentará adicionar mesmo assim. Recomenda-se evitar duplicatas.

**Q: Posso deixar campos opcionais vazios?**  
A: Sim, mas a vírgula separadora deve estar presente. Exemplo: `TOYOTA,COROLLA,,Prata,95000,...`

**Q: Como lidar com vírgulas nos dados (ex: "Corolla, modelo 2024")?**  
A: Use aspas duplas ao redor do campo: `"Corolla, modelo 2024"`

**Q: O sistema valida se a marca/modelo existe antes de importar veículos?**  
A: Não atualmente. A validação ocorre apenas nos campos obrigatórios.

---

## 📝 Changelog

- **2025-11-19:** Documentação inicial criada com base na análise do código atual
