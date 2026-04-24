import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronRight, HelpCircle, MessageCircle, Users, Megaphone, Settings, Smartphone, Zap, AlertCircle, CheckCircle, Info, ArrowLeft, Tag, Filter, Download, Upload, Clock, Send, BarChart2, Shuffle, Star, Archive, Trash2, Plus, CreditCard as Edit3 } from 'lucide-react';

// ─── Content types ────────────────────────────────────────────────────────────

interface Step {
  title: string;
  description: string;
}

interface Callout {
  type: 'tip' | 'warning' | 'info';
  text: string;
}

interface Section {
  heading: string;
  body?: string;
  steps?: Step[];
  callout?: Callout;
}

interface Topic {
  id: string;
  title: string;
  summary: string;
  icon: React.ElementType;
  sections: Section[];
}

interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
  topics: Topic[];
}

// ─── Help content ─────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'primeiros-passos',
    label: 'Primeiros Passos',
    icon: Zap,
    topics: [
      {
        id: 'visao-geral',
        title: 'Visão geral do sistema',
        summary: 'Entenda o que o BrainLead faz e como as principais áreas se conectam.',
        icon: HelpCircle,
        sections: [
          {
            heading: 'O que é o BrainLead?',
            body: 'O BrainLead é uma plataforma de gerenciamento de leads e envio de campanhas integrada ao WhatsApp. Você conecta seu número, importa ou recebe contatos automaticamente, conversa com eles pelo chat integrado e dispara campanhas de mensagens segmentadas.',
          },
          {
            heading: 'Áreas principais',
            steps: [
              { title: 'Inicio', description: 'Painel com resumo de leads, distribuição por categoria e atividade recente.' },
              { title: 'Chat', description: 'Caixa de entrada de conversas do WhatsApp em tempo real.' },
              { title: 'Gestão de Leads', description: 'CRM completo com visão Kanban e tabela para organizar seus contatos.' },
              { title: 'Campanhas', description: 'Criação e acompanhamento de disparos em massa segmentados.' },
              { title: 'Configurações', description: 'Conexão do WhatsApp e personalização das categorias de leads.' },
            ],
          },
          {
            heading: 'Fluxo recomendado',
            steps: [
              { title: '1. Conecte o WhatsApp', description: 'Vá em Configurações > Conexões e escaneie o QR code.' },
              { title: '2. Importe seus leads', description: 'No Chat ou na Gestão de Leads, importe um CSV com seus contatos.' },
              { title: '3. Organize por categorias', description: 'Mova leads pelo Kanban para refletir o estágio de cada um.' },
              { title: '4. Crie uma campanha', description: 'Dispare uma mensagem segmentada para o grupo certo.' },
            ],
          },
        ],
      },
      {
        id: 'conectar-whatsapp',
        title: 'Conectar o WhatsApp',
        summary: 'Como parear seu número de WhatsApp com o BrainLead via QR code.',
        icon: Smartphone,
        sections: [
          {
            heading: 'Como conectar',
            steps: [
              { title: 'Acesse Configurações', description: 'Clique em "Configurações" na barra lateral esquerda.' },
              { title: 'Aba Conexões', description: 'A aba "Conexões" já estará selecionada. Um QR code será gerado automaticamente.' },
              { title: 'Abra o WhatsApp no celular', description: 'No app do WhatsApp, vá em Menu (⋮) > Aparelhos conectados > Conectar um aparelho.' },
              { title: 'Escaneie o QR code', description: 'Aponte a câmera para o QR exibido na tela. A conexão é feita em segundos.' },
              { title: 'Aguarde a confirmação', description: 'O status muda para "Conectado" automaticamente após o pareamento.' },
            ],
            callout: {
              type: 'info',
              text: 'O QR code expira a cada 40 segundos. Se expirar antes de você escanear, clique em "Atualizar" para gerar um novo.',
            },
          },
          {
            heading: 'Desconectar o WhatsApp',
            body: 'Para desconectar, clique no botão "Desconectar" na mesma tela de Conexões. Isso encerra a sessão no BrainLead, mas não remove o aparelho do seu WhatsApp — você pode fazer isso manualmente no celular se preferir.',
            callout: {
              type: 'warning',
              text: 'Desconectar interrompe o recebimento de mensagens e o envio de campanhas. Reconecte sempre que necessário.',
            },
          },
          {
            heading: 'Solução de problemas',
            steps: [
              { title: 'QR code não aparece', description: 'Verifique sua conexão com a internet e recarregue a página.' },
              { title: 'Status fica em "Aguardando"', description: 'O QR expirou. Clique em atualizar e escaneie novamente.' },
              { title: 'Desconecta sozinho', description: 'O WhatsApp desconecta aparelhos inativos. Reescaneie o QR para reconectar.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chat e Conversas',
    icon: MessageCircle,
    topics: [
      {
        id: 'chat-interface',
        title: 'Usando o Chat',
        summary: 'Como visualizar e responder conversas do WhatsApp no BrainLead.',
        icon: MessageCircle,
        sections: [
          {
            heading: 'Navegando pelas conversas',
            body: 'O Chat exibe todas as conversas recebidas pelo seu número conectado. A lista à esquerda mostra os contatos ordenados pela mensagem mais recente. Clique em qualquer conversa para abrir o histórico.',
          },
          {
            heading: 'Filtros disponíveis',
            steps: [
              { title: 'Todas', description: 'Exibe todas as conversas ativas.' },
              { title: 'Não lidas', description: 'Filtra apenas conversas com mensagens ainda não visualizadas.' },
              { title: 'Arquivadas', description: 'Mostra conversas que foram arquivadas manualmente.' },
            ],
          },
          {
            heading: 'Busca',
            body: 'Use o campo de busca no topo da lista para encontrar conversas por nome, telefone ou conteúdo de mensagem. A busca filtra em tempo real enquanto você digita.',
          },
          {
            heading: 'Enviando mensagens',
            steps: [
              { title: 'Texto', description: 'Digite no campo de composição e pressione Enter ou clique em Enviar.' },
              { title: 'Imagem', description: 'Clique no ícone de clipe para anexar uma imagem.' },
              { title: 'Áudio', description: 'Clique no microfone para gravar uma nota de voz diretamente no navegador.' },
            ],
            callout: {
              type: 'tip',
              text: 'Use Respostas Rápidas para inserir textos prontos com um clique. Configure-as em Configurações.',
            },
          },
          {
            heading: 'Detalhes do lead',
            body: 'Clique no nome ou foto do contato para abrir o painel lateral com os detalhes completos: categoria, tags, empresa, e-mail, histórico de atividade e botões de ação rápida.',
          },
        ],
      },
      {
        id: 'arquivar-leads',
        title: 'Arquivar e organizar conversas',
        summary: 'Como arquivar conversas para manter a caixa de entrada limpa.',
        icon: Archive,
        sections: [
          {
            heading: 'Arquivar uma conversa',
            body: 'No painel de detalhes do lead (abra clicando no nome do contato), há um botão "Arquivar". Leads arquivados desaparecem da lista principal e só aparecem quando o filtro "Arquivadas" está ativo.',
          },
          {
            heading: 'Restaurar uma conversa',
            body: 'Ative o filtro "Arquivadas", abra o lead e clique em "Restaurar". O lead volta para a lista principal.',
          },
          {
            heading: 'Arquivamento em massa',
            body: 'Na tela de Gestão de Leads, selecione múltiplos leads usando as caixas de seleção e use a ação "Arquivar selecionados" para arquivar em lote.',
          },
        ],
      },
      {
        id: 'importar-leads-chat',
        title: 'Importar leads via CSV',
        summary: 'Como adicionar contatos em massa pelo Chat.',
        icon: Upload,
        sections: [
          {
            heading: 'Como importar',
            steps: [
              { title: 'Abra o Chat', description: 'Clique em "Chat" na barra lateral.' },
              { title: 'Botão de importação', description: 'Clique no ícone de upload no canto superior da lista de conversas.' },
              { title: 'Selecione o arquivo CSV', description: 'O arquivo deve ter as colunas: telefone (obrigatório), nome, email, empresa, tags.' },
              { title: 'Confirme a importação', description: 'O sistema exibirá um preview dos contatos. Clique em Importar para confirmar.' },
            ],
          },
          {
            heading: 'Formato do CSV',
            steps: [
              { title: 'phone', description: 'Número de telefone com DDD e código do país (ex: 5511999999999). Obrigatório.' },
              { title: 'name', description: 'Nome do contato. Opcional.' },
              { title: 'email', description: 'E-mail do contato. Opcional.' },
              { title: 'company', description: 'Empresa do contato. Opcional.' },
              { title: 'tags', description: 'Tags separadas por ponto e vírgula (ex: cliente;vip). Opcional.' },
            ],
            callout: {
              type: 'warning',
              text: 'Contatos com números duplicados serão ignorados na importação para evitar duplicatas.',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'leads',
    label: 'Gestão de Leads',
    icon: Users,
    topics: [
      {
        id: 'kanban-tabela',
        title: 'Kanban e Visão em Tabela',
        summary: 'Como alternar entre as duas formas de visualizar seus leads.',
        icon: Users,
        sections: [
          {
            heading: 'Visão Kanban',
            body: 'O Kanban exibe seus leads em colunas, uma para cada categoria (ex: Frio, Morno, Quente, Cliente). Arraste e solte um lead de uma coluna para outra para mudar sua categoria. Ideal para acompanhar o funil de vendas visualmente.',
          },
          {
            heading: 'Mover leads no Kanban',
            steps: [
              { title: 'Clique e segure', description: 'Clique no card do lead e segure o botão do mouse.' },
              { title: 'Arraste para a coluna desejada', description: 'Mova o card horizontalmente até a coluna de destino.' },
              { title: 'Solte', description: 'Solte o botão. A categoria do lead é atualizada automaticamente.' },
            ],
          },
          {
            heading: 'Visão em Tabela',
            body: 'A tabela exibe todos os leads em linhas com colunas: nome, telefone, empresa, categoria, última atividade e número de mensagens. Ideal para visualizar muitos leads de uma vez e para operações em massa.',
          },
          {
            heading: 'Alternar entre visões',
            body: 'Use os botões de visualização no canto superior direito da Gestão de Leads para alternar entre Kanban e Tabela.',
          },
        ],
      },
      {
        id: 'filtros-leads',
        title: 'Filtros e Busca de Leads',
        summary: 'Como encontrar leads específicos usando filtros e busca.',
        icon: Filter,
        sections: [
          {
            heading: 'Busca',
            body: 'O campo de busca no topo filtra leads por nome, telefone, e-mail, empresa ou tags em tempo real.',
          },
          {
            heading: 'Filtros disponíveis',
            steps: [
              { title: 'Favoritos', description: 'Exibe apenas leads marcados como favoritos (estrela amarela).' },
              { title: 'Arquivados', description: 'Exibe leads arquivados, que ficam ocultos por padrão.' },
            ],
          },
          {
            heading: 'Marcar como favorito',
            body: 'Clique na estrela ao lado do nome do lead para marcá-lo como favorito. Use o filtro de Favoritos para acessá-los rapidamente.',
          },
        ],
      },
      {
        id: 'operacoes-massa',
        title: 'Operações em Massa',
        summary: 'Como selecionar múltiplos leads e executar ações em lote.',
        icon: CheckCircle,
        sections: [
          {
            heading: 'Selecionar leads',
            body: 'Na visão em tabela, cada linha tem uma caixa de seleção na esquerda. Clique para selecionar leads individuais ou use a caixa de seleção no cabeçalho para selecionar todos os visíveis.',
          },
          {
            heading: 'Ações disponíveis em massa',
            steps: [
              { title: 'Mover para categoria', description: 'Altera a categoria de todos os selecionados de uma vez.' },
              { title: 'Arquivar', description: 'Arquiva todos os leads selecionados.' },
              { title: 'Excluir', description: 'Remove permanentemente os leads selecionados. Esta ação não pode ser desfeita.' },
            ],
            callout: {
              type: 'warning',
              text: 'A exclusão de leads é permanente e remove também o histórico de conversas. Prefira arquivar quando não tiver certeza.',
            },
          },
        ],
      },
      {
        id: 'exportar-csv',
        title: 'Exportar Leads para CSV',
        summary: 'Como baixar sua lista de leads em formato CSV.',
        icon: Download,
        sections: [
          {
            heading: 'Como exportar',
            steps: [
              { title: 'Acesse Gestão de Leads', description: 'Clique em "Gestao de Leads" na barra lateral.' },
              { title: 'Botão Exportar', description: 'Clique no botão "Exportar CSV" no canto superior direito.' },
              { title: 'Download automático', description: 'O arquivo CSV será baixado automaticamente para o seu computador.' },
            ],
          },
          {
            heading: 'Campos incluídos no CSV',
            body: 'O arquivo exportado contém: nome, telefone, e-mail, empresa, categoria, tags, número de mensagens, última atividade, data de criação e status (favorito, arquivado, bloqueado).',
          },
          {
            heading: 'Exportar um subconjunto',
            body: 'Aplique filtros ou busca antes de exportar para obter apenas os leads desejados no arquivo.',
          },
        ],
      },
      {
        id: 'categorias-leads',
        title: 'Categorias e Tags',
        summary: 'Como usar categorias e tags para organizar seus leads.',
        icon: Tag,
        sections: [
          {
            heading: 'Categorias',
            body: 'As categorias representam o estágio do lead no seu processo (ex: Frio, Morno, Quente, Cliente). Cada lead pertence a uma categoria por vez. Você pode criar, renomear, reordenar e personalizar o ícone e cor de cada categoria em Configurações > Categorias.',
          },
          {
            heading: 'Tags',
            body: 'Tags são rótulos livres que você pode aplicar a um lead para qualquer finalidade (ex: "indicação", "evento-junho", "vip"). Um lead pode ter várias tags. As tags são usadas nos filtros de campanha para segmentar o disparo.',
          },
          {
            heading: 'Adicionar tags a um lead',
            steps: [
              { title: 'Abra o detalhes do lead', description: 'Clique no nome do lead no Chat ou na Gestão de Leads.' },
              { title: 'Campo de tags', description: 'No painel lateral de detalhes, localize o campo "Tags".' },
              { title: 'Digite e confirme', description: 'Digite a tag e pressione Enter para adicionar. Repita para múltiplas tags.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'campanhas',
    label: 'Campanhas',
    icon: Megaphone,
    topics: [
      {
        id: 'criar-campanha',
        title: 'Criar uma Campanha',
        summary: 'Passo a passo completo para criar e enviar uma campanha de mensagens.',
        icon: Megaphone,
        sections: [
          {
            heading: 'O que é uma campanha?',
            body: 'Uma campanha é um disparo de mensagens em massa para um grupo selecionado de leads. Você define o conteúdo, os destinatários, o horário e o intervalo entre envios.',
          },
          {
            heading: 'Etapa 1 – Mensagem',
            steps: [
              { title: 'Nome da campanha', description: 'Dê um nome interno para identificar a campanha (não é enviado ao destinatário).' },
              { title: 'Tipo de mensagem', description: 'Escolha entre Texto, Imagem, Áudio ou Documento.' },
              { title: 'Conteúdo', description: 'Digite o texto ou faça upload do arquivo de mídia.' },
              { title: 'Legenda', description: 'Para imagem e documento, você pode adicionar uma legenda opcional.' },
              { title: 'Preview', description: 'O preview à direita simula como a mensagem vai aparecer no WhatsApp.' },
            ],
          },
          {
            heading: 'Etapa 2 – Destinatários',
            steps: [
              { title: 'Filtrar por categoria', description: 'Selecione uma ou mais categorias de leads para incluir.' },
              { title: 'Filtrar por tags', description: 'Adicione tags para segmentar ainda mais o público.' },
              { title: 'Excluir contatos recentes', description: 'Exclua leads que já receberam mensagens nos últimos N dias.' },
              { title: 'Excluir leads específicos', description: 'Desmarque leads individuais na lista abaixo.' },
              { title: 'Contador', description: 'O número de destinatários é atualizado em tempo real conforme você filtra.' },
            ],
          },
          {
            heading: 'Etapa 3 – Agendamento',
            steps: [
              { title: 'Envio imediato', description: 'A campanha começa assim que você clicar em Criar.' },
              { title: 'Agendar para uma data', description: 'Defina data e hora para o início do envio.' },
              { title: 'Janela de envio', description: 'Opcional: defina o horário de início e fim do dia (ex: 09:00 às 18:00) para que o sistema só envie durante o horário comercial.' },
              { title: 'Intervalo entre mensagens', description: 'Configure um intervalo aleatório (ex: entre 20s e 40s) para o sistema aguardar entre cada envio.' },
            ],
          },
          {
            heading: 'Etapa 4 – Revisão',
            body: 'Confira o resumo completo: nome, tipo, destinatários, agendamento, janela de envio, intervalo e tempo estimado total. Clique em "Criar Campanha" para finalizar.',
            callout: {
              type: 'tip',
              text: 'O tempo estimado é calculado com base no número de destinatários e no intervalo médio configurado.',
            },
          },
        ],
      },
      {
        id: 'intervalo-aleatorio',
        title: 'Intervalo Aleatório entre Mensagens',
        summary: 'Como configurar o intervalo randomizado para reduzir riscos de bloqueio.',
        icon: Shuffle,
        sections: [
          {
            heading: 'Por que usar intervalo aleatório?',
            body: 'O WhatsApp monitora padrões de envio automatizado. Usar sempre o mesmo intervalo fixo torna o comportamento previsível e aumenta o risco de bloqueio. Com o intervalo aleatório, cada mensagem espera um tempo diferente, tornando o envio mais natural.',
          },
          {
            heading: 'Como funciona',
            body: 'Na Etapa 3 do criador de campanha, você define dois pontos no slider: um mínimo e um máximo. Para cada mensagem enviada, o sistema sorteia um tempo dentro desse intervalo.',
          },
          {
            heading: 'Configurando o intervalo',
            steps: [
              { title: 'Ponto mínimo', description: 'Arraste o marcador da esquerda para definir o tempo mínimo de espera.' },
              { title: 'Ponto máximo', description: 'Arraste o marcador da direita para definir o tempo máximo de espera.' },
              { title: 'Gap obrigatório', description: 'Os dois pontos precisam ter pelo menos 15 segundos de diferença entre si.' },
              { title: 'Limites', description: 'O mínimo é 15 segundos e o máximo é 120 segundos.' },
            ],
            callout: {
              type: 'tip',
              text: 'Recomendamos configurar algo como "entre 20s e 45s" para um equilíbrio entre velocidade e segurança.',
            },
          },
        ],
      },
      {
        id: 'gerenciar-campanhas',
        title: 'Gerenciar Campanhas',
        summary: 'Como pausar, retomar, duplicar e acompanhar campanhas criadas.',
        icon: BarChart2,
        sections: [
          {
            heading: 'Status das campanhas',
            steps: [
              { title: 'Rascunho', description: 'Campanha criada mas ainda não iniciada.' },
              { title: 'Agendada', description: 'Aguardando a data/hora configurada para começar.' },
              { title: 'Enviando', description: 'Disparo em andamento.' },
              { title: 'Pausada', description: 'Envio pausado manualmente. Pode ser retomado.' },
              { title: 'Concluída', description: 'Todos os envios foram finalizados.' },
              { title: 'Cancelada', description: 'Campanha interrompida permanentemente.' },
            ],
          },
          {
            heading: 'Pausar e retomar',
            body: 'Enquanto uma campanha está no status "Enviando", aparece o botão "Pausar". Clique para interromper temporariamente. Para retomar, clique em "Retomar" — o envio continua de onde parou.',
          },
          {
            heading: 'Duplicar uma campanha',
            body: 'Clique nos três pontos (⋯) ao lado da campanha e selecione "Duplicar". Uma cópia é criada como rascunho com as mesmas configurações. Útil para reenviar a mesma mensagem para um público diferente ou em outra data.',
          },
          {
            heading: 'Acompanhar resultados',
            body: 'Clique no nome da campanha para abrir o painel de detalhes com estatísticas em tempo real: total enviado, entregue, lido, falhou, e taxa de entrega. Você pode filtrar a lista de destinatários por status.',
          },
          {
            heading: 'Excluir uma campanha',
            body: 'Campanhas em rascunho, concluídas ou canceladas podem ser excluídas permanentemente pelo menu (⋯). Campanhas em andamento devem ser pausadas ou canceladas antes.',
            callout: {
              type: 'warning',
              text: 'A exclusão de uma campanha remove também todos os dados de entrega associados.',
            },
          },
        ],
      },
      {
        id: 'janela-envio',
        title: 'Janela de Envio (Horário Comercial)',
        summary: 'Como configurar um horário restrito para o envio das mensagens.',
        icon: Clock,
        sections: [
          {
            heading: 'O que é a janela de envio?',
            body: 'A janela de envio define o intervalo do dia em que o sistema pode enviar mensagens. Por exemplo: se você configurar 09:00 às 18:00, o sistema para automaticamente ao atingir 18:00 e volta a enviar no dia seguinte às 09:00.',
          },
          {
            heading: 'Como configurar',
            steps: [
              { title: 'Etapa 3 do builder', description: 'Na tela de Agendamento, role até a seção "Janela de envio".' },
              { title: 'Definir horário de início', description: 'Selecione o horário mais cedo que o sistema pode enviar (ex: 09:00).' },
              { title: 'Definir horário de fim', description: 'Selecione o horário a partir do qual o sistema deve parar (ex: 18:00).' },
            ],
            callout: {
              type: 'info',
              text: 'A janela é opcional. Se não configurada, o sistema envia a qualquer hora do dia até concluir.',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    topics: [
      {
        id: 'categorias-config',
        title: 'Personalizar Categorias de Leads',
        summary: 'Como criar, renomear, reordenar e personalizar o visual das categorias.',
        icon: Edit3,
        sections: [
          {
            heading: 'Acessando as categorias',
            body: 'Vá em Configurações > aba Categorias. Você verá as categorias existentes como cards editáveis.',
          },
          {
            heading: 'Criar uma nova categoria',
            steps: [
              { title: 'Botão + Adicionar', description: 'Clique no botão "+ Adicionar Categoria" no final da lista.' },
              { title: 'Digite o nome', description: 'Insira o nome que deseja (ex: "Proposta enviada").' },
              { title: 'Salvar', description: 'Clique em salvar ou pressione Enter.' },
            ],
          },
          {
            heading: 'Editar nome, ícone e cor',
            steps: [
              { title: 'Clique no ícone de edição', description: 'Cada categoria tem um lápis de edição.' },
              { title: 'Altere o nome', description: 'Edite o texto no campo de nome.' },
              { title: 'Escolha um ícone', description: 'Selecione um ícone da paleta exibida.' },
              { title: 'Escolha uma cor', description: 'Selecione a cor do rótulo da categoria.' },
              { title: 'Salve', description: 'Clique em Salvar para aplicar.' },
            ],
          },
          {
            heading: 'Reordenar categorias',
            body: 'Arraste e solte os cards de categoria para mudar a ordem em que aparecem no Kanban e nos filtros de campanha.',
          },
          {
            heading: 'Excluir uma categoria',
            body: 'Clique no ícone de lixeira de uma categoria para excluí-la. Leads nessa categoria são movidos para o estado padrão.',
            callout: {
              type: 'warning',
              text: 'A exclusão de categorias é irreversível. Certifique-se de que não há leads importantes nela antes de excluir.',
            },
          },
        ],
      },
      {
        id: 'whatsapp-config',
        title: 'Configurações de Conexão',
        summary: 'Detalhes sobre o gerenciamento da conexão WhatsApp.',
        icon: Smartphone,
        sections: [
          {
            heading: 'Status da conexão',
            body: 'O indicador de status mostra se o WhatsApp está Conectado, Desconectado ou Aguardando. O sistema verifica o status automaticamente.',
          },
          {
            heading: 'Reconexão automática',
            body: 'Se a conexão cair enquanto a tela de Configurações estiver aberta, o sistema tenta gerar um novo QR code automaticamente para facilitar a reconexão.',
          },
          {
            heading: 'Múltiplos aparelhos',
            body: 'Cada conta BrainLead suporta uma instância de WhatsApp. Para usar um número diferente, desconecte o atual e conecte o novo.',
          },
        ],
      },
    ],
  },
  {
    id: 'planos',
    label: 'Planos e Limites',
    icon: Send,
    topics: [
      {
        id: 'trial',
        title: 'Período de Trial',
        summary: 'Como funciona o trial, seus limites e o que acontece quando ele expira.',
        icon: Clock,
        sections: [
          {
            heading: 'O que é o trial?',
            body: 'O trial é um período de teste com acesso completo ao sistema, mas com limite de envios e/ou tempo. Ele permite que você experimente todas as funcionalidades antes de assinar um plano.',
          },
          {
            heading: 'Indicador de trial na sidebar',
            body: 'Enquanto estiver no trial, a barra lateral exibe um bloco com: dias restantes, quantidade de envios realizados e o limite máximo, e uma barra de progresso.',
            callout: {
              type: 'info',
              text: 'A barra de progresso muda de cor: branca (normal) → âmbar (acima de 50%) → vermelha (acima de 80%) para indicar o nível de uso.',
            },
          },
          {
            heading: 'O que é bloqueado ao expirar?',
            body: 'Quando o trial expira (por tempo ou limite de envios atingido), o acesso ao Chat, Gestão de Leads e Campanhas é bloqueado. O Inicio e as Configurações continuam acessíveis.',
          },
          {
            heading: 'Como assinar um plano',
            body: 'Clique no bloco do trial na barra lateral ou em qualquer botão "Fazer upgrade" que aparecer. Um modal de planos disponíveis será exibido com as opções de assinatura.',
          },
        ],
      },
      {
        id: 'limite-envios',
        title: 'Limite de Envios',
        summary: 'Como o limite de envios é contabilizado e o que fazer quando esgota.',
        icon: Send,
        sections: [
          {
            heading: 'Como é contabilizado?',
            body: 'Cada mensagem enviada com sucesso por uma campanha conta como um envio. Mensagens do chat normal não são contabilizadas no limite.',
          },
          {
            heading: 'Ver o saldo atual',
            body: 'O bloco do trial na barra lateral mostra em tempo real quantos envios foram feitos e quantos restam.',
          },
          {
            heading: 'O que acontece ao esgotar?',
            body: 'Quando o limite é atingido, o sistema bloqueia o acesso ao Chat, Gestão de Leads e Campanhas até que você faça upgrade para um plano com mais envios.',
            callout: {
              type: 'warning',
              text: 'Campanhas em andamento são interrompidas quando o limite é atingido.',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'faq',
    label: 'Dúvidas Frequentes',
    icon: HelpCircle,
    topics: [
      {
        id: 'faq-geral',
        title: 'Perguntas Frequentes',
        summary: 'Respostas rápidas para as dúvidas mais comuns.',
        icon: HelpCircle,
        sections: [
          {
            heading: 'Posso usar o mesmo número em dois computadores?',
            body: 'Não. O WhatsApp permite apenas uma sessão ativa por número no BrainLead. Se abrir em outro navegador, a sessão anterior será encerrada.',
          },
          {
            heading: 'Por que algumas mensagens falham no envio?',
            body: 'Falhas de envio ocorrem principalmente por: número inexistente, contato que bloqueou o remetente, ou desconexão do WhatsApp durante o envio. Verifique o status da conexão em Configurações.',
          },
          {
            heading: 'O intervalo entre mensagens afeta campanhas agendadas?',
            body: 'Sim. O intervalo configurado (mínimo e máximo) é aplicado entre cada mensagem enviada, mesmo em campanhas agendadas. O tempo total estimado da campanha considera a média do intervalo.',
          },
          {
            heading: 'Posso editar uma campanha depois de criada?',
            body: 'Não é possível editar o conteúdo de uma campanha já criada. Para corrigir algo, duplique a campanha, edite a cópia e exclua a original (se ainda for rascunho).',
          },
          {
            heading: 'Como sei se um lead recebeu minha mensagem?',
            body: 'Abra a campanha e clique no nome do lead na lista de destinatários. O status indica: Pendente, Enviado, Entregue, Lido ou Falhou.',
          },
          {
            heading: 'O que acontece com campanhas pausadas?',
            body: 'Campanhas pausadas ficam com os destinatários restantes em fila. Ao retomar, o envio continua exatamente de onde parou, sem duplicar mensagens já enviadas.',
          },
          {
            heading: 'Posso importar o mesmo CSV duas vezes?',
            body: 'Sim, mas contatos com o mesmo número de telefone serão ignorados na segunda importação para evitar duplicatas.',
          },
          {
            heading: 'Como excluir um lead permanentemente?',
            body: 'Na Gestão de Leads (visão tabela), selecione o lead e use a ação "Excluir". Isso remove o contato e todo o histórico de conversas. Prefira arquivar se houver dúvida.',
          },
          {
            heading: 'As mensagens do chat contam no limite de envios?',
            body: 'Não. Apenas mensagens enviadas por campanhas contam para o limite. Conversas individuais no Chat são ilimitadas.',
          },
          {
            heading: 'Posso personalizar as categorias de leads?',
            body: 'Sim. Em Configurações > Categorias você pode criar, renomear, reordenar, mudar o ícone e a cor de cada categoria livremente.',
          },
        ],
      },
    ],
  },
];

// ─── Search index ─────────────────────────────────────────────────────────────

interface SearchResult {
  categoryId: string;
  categoryLabel: string;
  topic: Topic;
  matchText: string;
}

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];
  for (const cat of CATEGORIES) {
    for (const topic of cat.topics) {
      const parts: string[] = [topic.title, topic.summary];
      for (const sec of topic.sections) {
        parts.push(sec.heading);
        if (sec.body) parts.push(sec.body);
        if (sec.steps) sec.steps.forEach((s) => parts.push(s.title, s.description));
        if (sec.callout) parts.push(sec.callout.text);
      }
      results.push({
        categoryId: cat.id,
        categoryLabel: cat.label,
        topic,
        matchText: parts.join(' ').toLowerCase(),
      });
    }
  }
  return results;
}

const SEARCH_INDEX = buildSearchIndex();

// ─── Callout component ────────────────────────────────────────────────────────

function Callout({ type, text }: Callout) {
  const styles = {
    tip: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle, iconColor: 'text-emerald-600', textColor: 'text-emerald-800' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle, iconColor: 'text-amber-600', textColor: 'text-amber-800' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Info, iconColor: 'text-blue-600', textColor: 'text-blue-800' },
  }[type];
  const Icon = styles.icon;
  return (
    <div className={`flex gap-3 p-4 rounded-xl border ${styles.bg} ${styles.border} mt-4`}>
      <Icon size={16} className={`shrink-0 mt-0.5 ${styles.iconColor}`} />
      <p className={`text-sm leading-relaxed ${styles.textColor}`}>{text}</p>
    </div>
  );
}

// ─── Topic view ───────────────────────────────────────────────────────────────

function TopicView({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  return (
    <motion.div
      key={topic.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        Voltar
      </button>

      <div className="flex items-start gap-4 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
          <topic.icon size={20} className="text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{topic.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{topic.summary}</p>
        </div>
      </div>

      <div className="space-y-8">
        {topic.sections.map((sec, i) => (
          <div key={i}>
            <h2 className="text-base font-semibold text-gray-900 mb-3">{sec.heading}</h2>
            {sec.body && <p className="text-sm text-gray-600 leading-relaxed">{sec.body}</p>}
            {sec.steps && (
              <ol className="space-y-3 mt-3">
                {sec.steps.map((step, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {j + 1}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{step.title}</span>
                      <span className="text-sm text-gray-500 ml-1.5">{step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {sec.callout && <Callout {...sec.callout} />}
          </div>
        ))}
      </div>

      <SupportBanner />
    </motion.div>
  );
}

// ─── Support banner ───────────────────────────────────────────────────────────

const WHATSAPP_URL =
  'https://wa.me/5591982465495?text=Gostaria%20de%20tirar%20uma%20d%C3%BAvida%20sobre%20o%20BrainLead!';

function SupportBanner() {
  return (
    <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <p className="text-sm font-bold text-gray-900 mb-1">Precisa de Ajuda?</p>
      <p className="text-sm text-gray-500 mb-4">
        Em caso de dúvidas sobre os planos ou funcionalidades, nossa equipe está pronta para ajudar.
      </p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="text-[#25D366]">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Falar com Suporte
      </a>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HelpCenter() {
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set([CATEGORIES[0].id]));
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter((r) => r.matchText.includes(q));
  }, [query]);

  const searching = query.trim().length > 0;

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openTopic(topic: Topic) {
    setActiveTopic(topic);
    setQuery('');
  }

  function handleBack() {
    setActiveTopic(null);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle size={18} className="text-gray-400" />
            <h1 className="text-lg font-bold text-gray-900">Central de Ajuda</h1>
          </div>
          <p className="text-sm text-gray-500 mb-4">Encontre respostas sobre todas as funcionalidades do BrainLead.</p>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por tema, funcionalidade ou dúvida..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveTopic(null); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-gray-50 placeholder-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Plus size={14} className="rotate-45" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!activeTopic && (
          <aside className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50 hidden md:block">
            <div className="p-3 space-y-1">
              {CATEGORIES.map((cat) => {
                const isOpen = openCategories.has(cat.id);
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleCategory(cat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-all"
                    >
                      <cat.icon size={14} className="text-gray-500 shrink-0" />
                      <span className="flex-1 text-left">{cat.label}</span>
                      {isOpen
                        ? <ChevronDown size={12} className="text-gray-400" />
                        : <ChevronRight size={12} className="text-gray-400" />}
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-6 py-1 space-y-0.5">
                            {cat.topics.map((topic) => (
                              <button
                                key={topic.id}
                                onClick={() => openTopic(topic)}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-900 hover:bg-white transition-all truncate"
                              >
                                {topic.title}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <AnimatePresence mode="wait">
              {/* Active topic */}
              {activeTopic && !searching && (
                <TopicView key={activeTopic.id} topic={activeTopic} onBack={handleBack} />
              )}

              {/* Search results */}
              {searching && (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <p className="text-xs text-gray-400 mb-4">
                    {searchResults.length === 0
                      ? 'Nenhum resultado encontrado.'
                      : `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''} encontrado${searchResults.length !== 1 ? 's' : ''}`}
                  </p>
                  {searchResults.length === 0 ? (
                    <div className="text-center py-16">
                      <HelpCircle size={36} className="text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">Tente outras palavras-chave.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map((r) => (
                        <button
                          key={r.topic.id}
                          onClick={() => { openTopic(r.topic); }}
                          className="w-full text-left p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{r.categoryLabel}</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">{r.topic.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.topic.summary}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Default: category grid */}
              {!activeTopic && !searching && (
                <motion.div
                  key="home"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="space-y-10">
                    {CATEGORIES.map((cat) => (
                      <div key={cat.id}>
                        <div className="flex items-center gap-2 mb-4">
                          <cat.icon size={15} className="text-gray-500" />
                          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{cat.label}</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {cat.topics.map((topic) => (
                            <button
                              key={topic.id}
                              onClick={() => openTopic(topic)}
                              className="text-left p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm transition-all group"
                            >
                              <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
                                <topic.icon size={15} className="text-gray-600" />
                              </div>
                              <p className="text-sm font-semibold text-gray-900">{topic.title}</p>
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{topic.summary}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <SupportBanner />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
