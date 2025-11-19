# 📊 Referência Rápida - Importação CSV

## 📦 MODELOS (2 colunas)

```
Ordem: Marca,Modelo
```

| # | Coluna | Obrigatório | Exemplo |
|---|--------|-------------|---------|
| 1 | Marca | ✅ | TOYOTA |
| 2 | Modelo | ✅ | COROLLA |

**Arquivo exemplo:** `docs/exemplo_modelos.csv`

---

## 🚗 VEÍCULOS (20 colunas)

```
Ordem: marca,modelo,versao,opcionais,cor,concessionaria,preco,ano,anoModelo,status,cidade,estado,chassi,motor,combustivel,transmissao,observacoes,dataEntrada,vendedor,telefone
```

| # | Coluna | Obrigatório | Exemplo |
|---|--------|-------------|---------|
| 1 | marca | ✅ | TOYOTA |
| 2 | modelo | ✅ | COROLLA |
| 3 | versao | ❌ | XEI 2.0 |
| 4 | opcionais | ❌ | Ar Cond + Dir Hidráulica |
| 5 | cor | ❌ | Prata |
| 6 | concessionaria | ✅ | Concessionária Toyota SP |
| 7 | preco | ❌ | 95000 |
| 8 | ano | ❌ | 2023 |
| 9 | anoModelo | ❌ | 2024 |
| 10 | status | ❌ | Disponível |
| 11 | cidade | ✅ | São Paulo |
| 12 | estado | ✅ | SP |
| 13 | chassi | ❌ | 9BR1234567890 |
| 14 | motor | ❌ | 2.0 16V |
| 15 | combustivel | ❌ | Flex |
| 16 | transmissao | ❌ | Automática |
| 17 | observacoes | ❌ | Veículo em ótimo estado |
| 18 | dataEntrada | ❌ | 19/11/2025 |
| 19 | vendedor | ✅ | João Silva |
| 20 | telefone | ✅ | (11) 98765-4321 |

**Arquivo exemplo:** `docs/exemplo_veiculos.csv`

---

## ⚠️ Regras Importantes

1. ✅ Primeira linha = cabeçalhos (exatamente como mostrado)
2. ✅ Separador = vírgula (,)
3. ✅ Campos obrigatórios não podem estar vazios
4. ✅ Campos opcionais podem ficar vazios, mas a vírgula deve estar lá
5. ✅ Use aspas ("") se o valor contiver vírgula
6. ✅ Preço sem pontos/vírgulas (ex: 95000 não 95.000,00)
7. ✅ **Status válidos:** Disponível, Vendido, Reservado, Manutenção
8. ✅ **Combustível válido:** Flex, Gasolina, Etanol, Diesel, Elétrico, Híbrido
9. ✅ **Transmissão válida:** Manual, Automática, CVT
10. ✅ Data no formato DD/MM/AAAA (ex: 19/11/2025)

---

## 📂 Onde Importar

- **Modelos:** Dashboard Operador > Tabelas > Modelos > 📂 Importar CSV
- **Veículos:** Dashboard Operador > Consulta de Veículos > 📂 Importar CSV

---

## 📖 Documentação Completa

Ver: `docs/IMPORTACAO_MASSIVA.md`
