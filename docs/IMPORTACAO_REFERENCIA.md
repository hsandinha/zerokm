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

## 🚗 VEÍCULOS (10 colunas)

```
Ordem: marca,modelo,versao,cor,preco,concessionaria,cidade,estado,vendedor,telefone
```

| # | Coluna | Obrigatório | Exemplo |
|---|--------|-------------|---------|
| 1 | marca | ✅ | TOYOTA |
| 2 | modelo | ✅ | COROLLA |
| 3 | versao | ❌ | XEI 2.0 |
| 4 | cor | ❌ | Prata |
| 5 | preco | ❌ | 95000 |
| 6 | concessionaria | ✅ | Concessionária Toyota SP |
| 7 | cidade | ✅ | São Paulo |
| 8 | estado | ✅ | SP |
| 9 | vendedor | ✅ | João Silva |
| 10 | telefone | ✅ | (11) 98765-4321 |

**Arquivo exemplo:** `docs/exemplo_veiculos.csv`

---

## ⚠️ Regras Importantes

1. ✅ Primeira linha = cabeçalhos (exatamente como mostrado)
2. ✅ Separador = vírgula (,)
3. ✅ Campos obrigatórios não podem estar vazios
4. ✅ Campos opcionais podem ficar vazios, mas a vírgula deve estar lá
5. ✅ Use aspas ("") se o valor contiver vírgula
6. ✅ Preço sem pontos/vírgulas (ex: 95000 não 95.000,00)

---

## 📂 Onde Importar

- **Modelos:** Dashboard Operador > Tabelas > Modelos > 📂 Importar CSV
- **Veículos:** Dashboard Operador > Consulta de Veículos > 📂 Importar CSV

---

## 📖 Documentação Completa

Ver: `docs/IMPORTACAO_MASSIVA.md`
