// Dados de Estados e Cidades do Brasil
export interface Estado {
    sigla: string;
    nome: string;
    cidades: string[];
}

export const estadosBrasil: Estado[] = [
    {
        sigla: 'AC',
        nome: 'Acre',
        cidades: [
            'Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó',
            'Brasiléia', 'Plácido de Castro', 'Xapuri', 'Epitaciolândia', 'Acrelândia',
            'Bujari', 'Capixaba', 'Senador Guiomard', 'Porto Walter', 'Jordão',
            'Marechal Thaumaturgo', 'Rodrigues Alves', 'Mâncio Lima', 'Santa Rosa do Purus',
            'Assis Brasil', 'Manuel Urbano', 'Porto Acre'
        ]
    },
    {
        sigla: 'AL',
        nome: 'Alagoas',
        cidades: [
            'Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios', 'União dos Palmares',
            'Penedo', 'Coruripe', 'São Miguel dos Campos', 'Santana do Ipanema', 'Delmiro Gouveia',
            'Marechal Deodoro', 'Pilar', 'São Luís do Quitunde', 'Girau do Ponciano', 'Viçosa',
            'Campo Alegre', 'Murici', 'São José da Laje', 'Messias', 'Atalaia',
            'Porto Calvo', 'Joaquim Gomes', 'Branquinha', 'Flexeiras', 'São Sebastião',
            'Ibateguara', 'Colônia Leopoldina', 'Jundiá', 'Paulo Jacinto', 'Taquarana'
        ]
    },
    {
        sigla: 'AP',
        nome: 'Amapá',
        cidades: [
            'Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Porto Grande',
            'Mazagão', 'Pedra Branca do Amapari', 'Vitória do Jari', 'Tartarugalzinho',
            'Amapá', 'Ferreira Gomes', 'Pracuúba', 'Calçoene', 'Cutias', 'Itaubal', 'Serra do Navio'
        ]
    },
    {
        sigla: 'AM',
        nome: 'Amazonas',
        cidades: [
            'Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé',
            'Tabatinga', 'Maués', 'São Paulo de Olivença', 'Humaitá', 'Lábrea',
            'Benjamin Constant', 'Manicoré', 'Autazes', 'Carauari', 'Eirunepé',
            'Iranduba', 'Presidente Figueiredo', 'Rio Preto da Eva', 'Fonte Boa',
            'Tonantins', 'Anori', 'Anamã', 'Beruri', 'Boca do Acre', 'Borba',
            'Caapiranga', 'Careiro', 'Careiro da Várzea', 'Codajás', 'Eirunepé'
        ]
    },
    {
        sigla: 'BA',
        nome: 'Bahia',
        cidades: [
            'Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Juazeiro',
            'Itabuna', 'Lauro de Freitas', 'Ilhéus', 'Jequié', 'Teixeira de Freitas',
            'Alagoinhas', 'Porto Seguro', 'Simões Filho', 'Paulo Afonso', 'Eunápolis',
            'Santo Antônio de Jesus', 'Valença', 'Candeias', 'Guanambi', 'Jacobina',
            'Serrinha', 'Senhor do Bonfim', 'Dias d\'Ávila', 'Luís Eduardo Magalhães',
            'Itapetinga', 'Irecê', 'Campo Formoso', 'Casa Nova', 'Brumado', 'Bom Jesus da Lapa'
        ]
    },
    {
        sigla: 'CE',
        nome: 'Ceará',
        cidades: [
            'Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral',
            'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá', 'Canindé',
            'Aquiraz', 'Pacatuba', 'Crateús', 'Russas', 'Limoeiro do Norte',
            'Quixeramobim', 'Pacajus', 'Cascavel', 'Icó', 'Horizonte', 'Camocim',
            'Morada Nova', 'Aracati', 'Barbalha', 'Baturité', 'Jijoca de Jericoacoara',
            'Tianguá', 'Acaraú', 'Viçosa do Ceará'
        ]
    },
    {
        sigla: 'DF',
        nome: 'Distrito Federal',
        cidades: ['Brasília']
    },
    {
        sigla: 'ES',
        nome: 'Espírito Santo',
        cidades: [
            'Vitória', 'Vila Velha', 'Cariacica', 'Serra', 'Cachoeiro de Itapemirim',
            'Linhares', 'São Mateus', 'Colatina', 'Guarapari', 'Viana',
            'Nova Venécia', 'Barra de São Francisco', 'Santa Teresa', 'Aracruz',
            'Alegre', 'Baixo Guandu', 'Conceição da Barra', 'Itapemirim', 'Marataízes',
            'Presidente Kennedy', 'Rio Novo do Sul', 'Santa Leopoldina', 'São Gabriel da Palha',
            'Sooretama', 'Vargem Alta', 'Venâncio'
        ]
    },
    {
        sigla: 'GO',
        nome: 'Goiás',
        cidades: [
            'Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia',
            'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Trindade', 'Formosa',
            'Novo Gama', 'Itumbiara', 'Senador Canedo', 'Catalão', 'Jataí',
            'Planaltina', 'Caldas Novas', 'Santo Antônio do Descoberto', 'Goianésia',
            'Cidade Ocidental', 'Mineiros', 'Cristalina', 'Inhumas', 'Ipatinga',
            'Quirinópolis', 'Goiás', 'Ceres', 'Uruaçu', 'Porangatu', 'Itaberaí', 'Silvânia'
        ]
    },
    {
        sigla: 'MA',
        nome: 'Maranhão',
        cidades: [
            'São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias',
            'Codó', 'Paço do Lumiar', 'Açailândia', 'Bacabal', 'Balsas',
            'Barra do Corda', 'Santa Inês', 'Pinheiro', 'Pedreiras', 'Santa Luzia',
            'Chapadinha', 'Presidente Dutra', 'Viana', 'Grajaú', 'Itapecuru Mirim',
            'Coelho Neto', 'Colinas', 'Lago da Pedra', 'São João Batista',
            'Zé Doca', 'Carolina', 'Estreito', 'São Domingos do Maranhão', 'Riachão', 'Tutóia'
        ]
    },
    {
        sigla: 'MT',
        nome: 'Mato Grosso',
        cidades: [
            'Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra',
            'Cáceres', 'Sorriso', 'Lucas do Rio Verde', 'Barra do Garças', 'Primavera do Leste',
            'Alta Floresta', 'Diamantino', 'Nova Mutum', 'Pontes e Lacerda', 'Juína',
            'Colíder', 'Poxoréu', 'Água Boa', 'Guarantã do Norte', 'Mirassol d\'Oeste',
            'São José do Rio Claro', 'Matupá', 'Campo Novo do Parecis', 'Brasnorte',
            'Sapezal', 'Campo Verde', 'Jaciara', 'Comodoro', 'Araputanga', 'Feliz Natal'
        ]
    },
    {
        sigla: 'MS',
        nome: 'Mato Grosso do Sul',
        cidades: [
            'Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã',
            'Naviraí', 'Nova Andradina', 'Sidrolândia', 'Maracaju', 'São Gabriel do Oeste',
            'Coxim', 'Aquidauana', 'Paranaíba', 'Amambai', 'Ribas do Rio Pardo',
            'Miranda', 'Caarapó', 'Bonito', 'Jardim', 'Anastácio',
            'Cassilândia', 'Chapadão do Sul', 'Costa Rica', 'Ivinhema', 'Laguna Carapã',
            'Mundo Novo', 'Rio Brilhante', 'Sonora', 'Terenos', 'Fátima do Sul'
        ]
    },
    {
        sigla: 'MG',
        nome: 'Minas Gerais',
        cidades: [
            'Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim',
            'Montes Claros', 'Ribeirão das Neves', 'Uberaba', 'Governador Valadares', 'Ipatinga',
            'Sete Lagoas', 'Divinópolis', 'Santa Luzia', 'Ibirité', 'Poços de Caldas',
            'Patos de Minas', 'Pouso Alegre', 'Teófilo Otoni', 'Barbacena', 'Sabará',
            'Vespasiano', 'Conselheiro Lafaiete', 'Varginha', 'Itabira', 'Passos',
            'Coronel Fabriciano', 'Muriaé', 'Ituiutaba', 'Araguari', 'Lavras',
            'Itajubá', 'Açucena', 'Timóteo', 'Paracatu', 'Caratinga'
        ]
    },
    {
        sigla: 'PA',
        nome: 'Pará',
        cidades: [
            'Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Parauapebas', 'Castanhal',
            'Abaetetuba', 'Cametá', 'Marituba', 'Bragança', 'Altamira', 'Tucuruí',
            'Paragominas', 'Redenção', 'Itaituba', 'Oriximiná', 'Barcarena', 'Benevides',
            'Capanema', 'Tailândia', 'Novo Progresso', 'São Félix do Xingu', 'Tomé-Açu',
            'Ourilândia do Norte', 'Vigia', 'Salinópolis', 'Monte Alegre', 'Conceição do Araguaia',
            'Rio Maria', 'Xinguara'
        ]
    },
    {
        sigla: 'PB',
        nome: 'Paraíba',
        cidades: [
            'João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux',
            'Sousa', 'Cajazeiras', 'Cabedelo', 'Guarabira', 'Mamanguape',
            'São Bento', 'Esperança', 'Pombal', 'Monteiro', 'Princesa Isabel',
            'Queimadas', 'Conde', 'Itabaiana', 'Catolé do Rocha', 'Rio Tinto',
            'Areia', 'Sumé', 'Piancó', 'Picuí', 'Conceição', 'Cuité',
            'Caaporã', 'Taperoá', 'Sapé', 'Desterro'
        ]
    },
    {
        sigla: 'PR',
        nome: 'Paraná',
        cidades: [
            'Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel',
            'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava', 'Paranaguá',
            'Araucária', 'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo',
            'Arapongas', 'Almirante Tamandaré', 'Umuarama', 'Piraquara', 'Cambé',
            'Sarandi', 'Fazenda Rio Grande', 'Paranavaí', 'Francisco Beltrão', 'Pato Branco',
            'Cianorte', 'Telêmaco Borba', 'Castro', 'Rolândia', 'Irati'
        ]
    },
    {
        sigla: 'PE',
        nome: 'Pernambuco',
        cidades: [
            'Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina',
            'Paulista', 'Cabo de Santo Agostinho', 'Camaragibe', 'Garanhuns', 'Vitória de Santo Antão',
            'Igarassu', 'São Lourenço da Mata', 'Santa Cruz do Capibaribe', 'Abreu e Lima',
            'Ipojuca', 'Serra Talhada', 'Araripina', 'Gravatá', 'Carpina', 'Goiana',
            'Belo Jardim', 'Arcoverde', 'Ouricuri', 'Escada', 'Pesqueira',
            'Surubim', 'Palmares', 'Bezerros', 'São Bento do Una', 'Limoeiro'
        ]
    },
    {
        sigla: 'PI',
        nome: 'Piauí',
        cidades: [
            'Teresina', 'Parnaíba', 'Picos', 'Piripiri', 'Floriano', 'Campo Maior',
            'Barras', 'União', 'Altos', 'Pedro II', 'Valença', 'José de Freitas',
            'Oeiras', 'São Raimundo Nonato', 'Esperantina', 'Piracuruca', 'Cocal',
            'São João do Piauí', 'Simplício Mendes', 'Corrente', 'Bom Jesus',
            'Regeneração', 'Luzilândia', 'Água Branca', 'Inhuma', 'Bertolínia',
            'Guadalupe', 'Fronteiras', 'Gilbués', 'Beneditinos'
        ]
    },
    {
        sigla: 'RJ',
        nome: 'Rio de Janeiro',
        cidades: [
            'Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói',
            'Campos dos Goytacazes', 'Belford Roxo', 'São João de Meriti', 'Petrópolis', 'Volta Redonda',
            'Magé', 'Macaé', 'Itaboraí', 'Cabo Frio', 'Nova Friburgo',
            'Barra Mansa', 'Angra dos Reis', 'Mesquita', 'Teresópolis', 'Nilópolis',
            'Maricá', 'Queimados', 'Rio das Ostras', 'Resende', 'Araruama',
            'Itaguaí', 'Japeri', 'Itaperuna', 'São Pedro da Aldeia', 'Barra do Piraí'
        ]
    },
    {
        sigla: 'RN',
        nome: 'Rio Grande do Norte',
        cidades: [
            'Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba',
            'Ceará-Mirim', 'Caicó', 'Açu', 'Currais Novos', 'Nova Cruz',
            'João Câmara', 'Canguaretama', 'Touros', 'São José de Mipibu', 'Santa Cruz',
            'Pau dos Ferros', 'São Paulo do Potengi', 'Apodi', 'Areia Branca', 'Extremoz',
            'Monte Alegre', 'Angicos', 'Baraúna', 'Pendências', 'Macau',
            'São Bento do Norte', 'Alexandria', 'Lajes', 'Carnaubais', 'Jucurutu'
        ]
    },
    {
        sigla: 'RS',
        nome: 'Rio Grande do Sul',
        cidades: [
            'Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria',
            'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande',
            'Alvorada', 'Passo Fundo', 'Sapucaia do Sul', 'Uruguaiana', 'Santa Cruz do Sul',
            'Cachoeirinha', 'Bagé', 'Bento Gonçalves', 'Erechim', 'Guaíba',
            'Cachoeira do Sul', 'Santana do Livramento', 'Ijuí', 'Sapiranga', 'Santo Ângelo',
            'Alegrete', 'Lajeado', 'Cruz Alta', 'Venâncio Aires', 'Camaquã'
        ]
    },
    {
        sigla: 'RO',
        nome: 'Rondônia',
        cidades: [
            'Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal',
            'Rolim de Moura', 'Guajará-Mirim', 'Jaru', 'Ouro Preto do Oeste', 'Pimenta Bueno',
            'Buritis', 'Espigão d\'Oeste', 'Colorado do Oeste', 'Cerejeiras', 'Alta Floresta d\'Oeste',
            'Costa Marques', 'Machadinho d\'Oeste', 'Nova Brasilândia d\'Oeste', 'Presidente Médici',
            'São Francisco do Guaporé', 'São Miguel do Guaporé', 'Theobroma', 'Urupá', 'Vale do Anari',
            'Vale do Paraíso', 'Mirante da Serra', 'Nova Mamoré', 'Alvorada d\'Oeste', 'Alto Alegre dos Parecis',
            'Chupinguaia'
        ]
    },
    {
        sigla: 'RR',
        nome: 'Roraima',
        cidades: [
            'Boa Vista', 'Rorainópolis', 'Caracaraí', 'Alto Alegre', 'Mucajaí',
            'Iracema', 'São João da Baliza', 'São Luiz', 'Caroebe', 'Normandia',
            'Pacaraima', 'Amajari', 'Bonfim', 'Cantá', 'Uiramutã'
        ]
    },
    {
        sigla: 'SC',
        nome: 'Santa Catarina',
        cidades: [
            'Joinville', 'Florianópolis', 'Blumenau', 'São José', 'Criciúma',
            'Chapecó', 'Itajaí', 'Lages', 'Jaraguá do Sul', 'Palhoça',
            'Balneário Camboriú', 'Brusque', 'Tubarão', 'São Bento do Sul', 'Caçador',
            'Camboriú', 'Navegantes', 'Concórdia', 'Rio do Sul', 'Araranguá',
            'Gaspar', 'Biguaçu', 'Indaial', 'Itapema', 'Mafra',
            'Canoinhas', 'Içara', 'Videira', 'São Francisco do Sul', 'Laguna'
        ]
    },
    {
        sigla: 'SP',
        nome: 'São Paulo',
        cidades: [
            'São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André',
            'Osasco', 'Ribeirão Preto', 'Sorocaba', 'Mauá', 'São José dos Campos',
            'Mogi das Cruzes', 'Diadema', 'Jundiaí', 'Carapicuíba', 'Piracicaba',
            'Bauru', 'São Vicente', 'Itaquaquecetuba', 'Franca', 'Guarujá',
            'Taubaté', 'Praia Grande', 'Limeira', 'Suzano', 'Taboão da Serra',
            'Sumaré', 'Barueri', 'Embu das Artes', 'São Carlos', 'Marília',
            'Indaiatuba', 'Cotia', 'Americana', 'Jacareí', 'Araraquara',
            'Santos', 'Hortolândia', 'Presidente Prudente', 'São José do Rio Preto', 'Rio Claro'
        ]
    },
    {
        sigla: 'SE',
        nome: 'Sergipe',
        cidades: [
            'Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão',
            'Estância', 'Tobias Barreto', 'Simão Dias', 'Propriá', 'Barra dos Coqueiros',
            'Laranjeiras', 'Itabaianinha', 'Capela', 'Japoatã', 'Poço Redondo',
            'Ribeirópolis', 'Neópolis', 'Nossa Senhora da Glória', 'Arauá', 'Carira',
            'Carmópolis', 'Rosário do Catete', 'Maruim', 'Frei Paulo', 'Campo do Brito',
            'Santo Amaro das Brotas', 'Pedra Mole', 'Pacatuba', 'Divina Pastora', 'General Maynard'
        ]
    },
    {
        sigla: 'TO',
        nome: 'Tocantins',
        cidades: [
            'Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins',
            'Colinas do Tocantins', 'Guaraí', 'Tocantinópolis', 'Miracema do Tocantins', 'Dianópolis',
            'Araguatins', 'Taguatinga', 'Pedro Afonso', 'Augustinópolis', 'Colméia',
            'Formoso do Araguaia', 'Xambioá', 'Miranorte', 'Cristalândia', 'Nova Olinda',
            'Axixá do Tocantins', 'Babaçulândia', 'Filadélfia', 'Presidente Kennedy', 'Wanderlândia',
            'Arraias', 'Combinado', 'Couto Magalhães', 'Esperantina', 'Goiatins'
        ]
    }
];

// Função para obter todos os estados
export const getEstados = (): string[] => {
    return estadosBrasil.map(estado => `${estado.nome} - ${estado.sigla}`);
};

// Função para obter todas as cidades
export const getAllCidades = (): string[] => {
    return estadosBrasil.flatMap(estado => estado.cidades);
};

// Função para obter cidades de um estado específico
export const getCidadesByEstado = (estadoNome: string): string[] => {
    const estado = estadosBrasil.find(e =>
        e.nome.toLowerCase() === estadoNome.toLowerCase() ||
        e.sigla.toLowerCase() === estadoNome.toLowerCase() ||
        `${e.nome} - ${e.sigla}`.toLowerCase() === estadoNome.toLowerCase()
    );
    return estado ? estado.cidades : [];
};

// Função para filtrar cidades por busca
export const filterCidades = (searchTerm: string, estadoSelecionado?: string): string[] => {
    let cidades: string[];

    if (estadoSelecionado) {
        cidades = getCidadesByEstado(estadoSelecionado);
    } else {
        cidades = getAllCidades();
    }

    if (!searchTerm || searchTerm.length < 2) {
        return [];
    }

    return cidades.filter(cidade =>
        cidade.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 15); // Limitar a 15 resultados
};