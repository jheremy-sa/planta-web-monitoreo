/**
 * common.js — Tema claro/oscuro + sistema de idiomas (i18n)
 * HMI Industrial · Transformación Digital Acuicultura UPSE
 */

// ================================================================
// TEMA CLARO / OSCURO
// ================================================================
function initTema() {
  const guardado = localStorage.getItem('hmi_tema') || 'dark';
  aplicarTema(guardado);
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  localStorage.setItem('hmi_tema', tema);
  const btn = document.getElementById('btnTema');
  if (btn) {
    btn.innerHTML = tema === 'dark'
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
    btn.title = tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }
}

function toggleTema() {
  const actual = localStorage.getItem('hmi_tema') || 'dark';
  aplicarTema(actual === 'dark' ? 'light' : 'dark');
}

// ================================================================
// IDIOMAS
// ================================================================
const IDIOMAS = {
  es: { nombre: 'Español',   fi: 'es' },
  en: { nombre: 'English',   fi: 'gb' },
  pt: { nombre: 'Português', fi: 'br' },
  fr: { nombre: 'Français',  fi: 'fr' },
  de: { nombre: 'Deutsch',   fi: 'de' },
  it: { nombre: 'Italiano',  fi: 'it' },
  zh: { nombre: '中文',       fi: 'cn' },
  ja: { nombre: '日本語',      fi: 'jp' },
};

// Etiqueta del idioma actual para el topbar
function labelIdioma(code) {
  const info = IDIOMAS[code];
  if (!info) return '';
  return `<span class="fi fi-${info.fi}" style="border-radius:2px;width:18px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></span>${info.nombre}`;
}

const T = {
  es: {
    // Nav
    'nav.plant':    'Planta',
    'nav.history':  'Historial',
    'nav.comments': 'Comentarios',
    'nav.users':    'Usuarios',
    // Login
    'login.subtitle': 'Transformación Digital, Aplicando IA en Acuicultura',
    'login.email':  'Correo',
    'login.pass':   'Contraseña',
    'login.btn':    'Ingresar al sistema',
    'login.forgot': '¿Olvidaste tu contraseña?',
    'login.reset.title': 'Recuperar Acceso',
    'login.reset.desc':  'El Admin Pro recibirá tu solicitud y generará una contraseña temporal.',
    'login.reset.send':  'Enviar solicitud',
    'login.back':   '← Volver al login',
    // HMI
    'hmi.plant1':   'Planta 1',
    'hmi.plant2':   'Planta 2',
    'hmi.vars':     'Variables del Proceso',
    'hmi.cam':      'Cámara en Vivo',
    'hmi.chart':    'Nivel del Tanque — Últimos 30 min',
    'hmi.ctrl1':    'Control Planta 1',
    'hmi.ctrl2':    'Control Planta 2',
    'hmi.cam.na':   'Cámara no disponible',
    'hmi.retry':    'Reintentar',
    'ctrl.pump':    'Bomba',
    'ctrl.valve':   'Electroválvula',
    'ctrl.on':      'Encender',
    'ctrl.off':     'Apagar',
    'ctrl.open':    'Abrir',
    'ctrl.close':   'Cerrar',
    'ctrl.on_s':    'Encendida',
    'ctrl.off_s':   'Apagada',
    'ctrl.open_s':  'Abierta',
    'ctrl.close_s': 'Cerrada',
    // Sensores
    's.level':  'Nivel',
    's.flow':   'Caudal',
    's.temp_a': 'Temp. Ambiente',
    's.humid':  'Humedad',
    's.temp_w': 'Temp. Agua',
    's.flo_lo': 'Flotador Bajo',
    's.flo_hi': 'Flotador Alto',
    's.active': 'Activo',
    's.normal': 'Normal',
    // Notif
    'notif.title':  'Notificaciones',
    'notif.read_all': 'Leer todas',
    'notif.empty':  'Sin notificaciones',
    // Historial
    'hist.title':   'Historial de Actividades',
    'hist.from':    'Desde',
    'hist.to':      'Hasta',
    'hist.filter':  'Filtrar',
    'hist.export':  'Exportar Historial CSV',
    'hist.exp_lec': 'Exportar Lecturas CSV',
    'hist.date':    'Fecha y hora',
    'hist.action':  'Acción',
    'hist.user':    'Usuario',
    'hist.desc':    'Descripción',
    'hist.empty':   'No hay registros en este período',
    'hist.system':  'sistema',
    // Comentarios
    'com.title':    'Comentarios y Solicitudes',
    'com.new':      'Nueva solicitud',
    'com.empty':    'No hay solicitudes aún',
    'com.type':     'Tipo de solicitud',
    'com.subject':  'Asunto',
    'com.justif':   'Justificación',
    'com.justif_ph':'Explica detalladamente el motivo de tu solicitud...',
    'com.send':     'Enviar solicitud',
    'com.cancel':   'Cancelar',
    'com.reply':    'Responder',
    'com.approve':  'Aprobar',
    'com.reject':   'Rechazar',
    'com.pending':  'Pendiente',
    'com.answered': 'Respondido',
    'com.rejected': 'Rechazado',
    'com.from':     'De',
    'com.status':   'Estado',
    'com.gen_token':'Generar token de acceso al editor',
    'com.duration': 'Duración',
    // Usuarios
    'usr.title':    'Gestión de Usuarios',
    'usr.new':      'Nuevo usuario',
    'usr.email':    'Correo',
    'usr.username': 'Nombre de usuario',
    'usr.pass':     'Contraseña inicial',
    'usr.role':     'Rol',
    'usr.status':   'Estado',
    'usr.lastlogin':'Último login',
    'usr.actions':  'Acciones',
    'usr.create':   'Crear usuario',
    'usr.active':   'Activo',
    'usr.inactive': 'Suspendido',
    'usr.suspend':  'Suspender',
    'usr.activate': 'Activar',
    'usr.reset_pwd':'Reset pwd',
    'usr.change_role':'Cambiar rol',
    // General
    'g.logout':     'Cerrar sesión',
    'g.myaccount':  'Mi cuenta',
    'g.loading':    'Cargando...',
    'g.connecting': 'Conectando...',
    'g.save':       'Guardar',
    'g.min':        'min',
    'g.hour':       'hora',
    'g.hours':      'horas',
    'g.never':      'Nunca',
  },

  en: {
    'nav.plant':'Plant','nav.history':'History','nav.comments':'Comments','nav.users':'Users',
    'login.subtitle':'Digital Transformation, Applying AI in Aquaculture',
    'login.email':'Email','login.pass':'Password','login.btn':'Sign in',
    'login.forgot':'Forgot your password?',
    'login.reset.title':'Recover Access',
    'login.reset.desc':'The Admin Pro will receive your request and generate a temporary password.',
    'login.reset.send':'Send request','login.back':'← Back to login',
    'hmi.plant1':'Plant 1','hmi.plant2':'Plant 2',
    'hmi.vars':'Process Variables','hmi.cam':'Live Camera',
    'hmi.chart':'Tank Level — Last 30 min',
    'hmi.ctrl1':'Plant 1 Control','hmi.ctrl2':'Plant 2 Control',
    'hmi.cam.na':'Camera unavailable','hmi.retry':'Retry',
    'ctrl.pump':'Pump','ctrl.valve':'Solenoid Valve',
    'ctrl.on':'Turn On','ctrl.off':'Turn Off','ctrl.open':'Open','ctrl.close':'Close',
    'ctrl.on_s':'Running','ctrl.off_s':'Stopped','ctrl.open_s':'Open','ctrl.close_s':'Closed',
    's.level':'Level','s.flow':'Flow Rate','s.temp_a':'Ambient Temp','s.humid':'Humidity',
    's.temp_w':'Water Temp','s.flo_lo':'Low Float','s.flo_hi':'High Float',
    's.active':'Active','s.normal':'Normal',
    'notif.title':'Notifications','notif.read_all':'Mark all read','notif.empty':'No notifications',
    'hist.title':'Activity Log','hist.from':'From','hist.to':'To','hist.filter':'Filter',
    'hist.export':'Export History CSV','hist.exp_lec':'Export Readings CSV',
    'hist.date':'Date & time','hist.action':'Action','hist.user':'User','hist.desc':'Description',
    'hist.empty':'No records in this period','hist.system':'system',
    'com.title':'Comments & Requests','com.new':'New request','com.empty':'No requests yet',
    'com.type':'Request type','com.subject':'Subject','com.justif':'Justification',
    'com.justif_ph':'Explain in detail the reason for your request...',
    'com.send':'Send request','com.cancel':'Cancel','com.reply':'Reply',
    'com.approve':'Approve','com.reject':'Reject',
    'com.pending':'Pending','com.answered':'Answered','com.rejected':'Rejected',
    'com.from':'From','com.status':'Status','com.gen_token':'Generate editor access token',
    'com.duration':'Duration',
    'usr.title':'User Management','usr.new':'New user','usr.email':'Email',
    'usr.username':'Username','usr.pass':'Initial password','usr.role':'Role',
    'usr.status':'Status','usr.lastlogin':'Last login','usr.actions':'Actions',
    'usr.create':'Create user','usr.active':'Active','usr.inactive':'Suspended',
    'usr.suspend':'Suspend','usr.activate':'Activate','usr.reset_pwd':'Reset pwd',
    'usr.change_role':'Change role',
    'g.logout':'Sign out','g.myaccount':'My account','g.loading':'Loading...',
    'g.connecting':'Connecting...','g.save':'Save','g.min':'min','g.hour':'hour',
    'g.hours':'hours','g.never':'Never',
  },

  pt: {
    'nav.plant':'Planta','nav.history':'Histórico','nav.comments':'Comentários','nav.users':'Usuários',
    'login.subtitle':'Transformação Digital, Aplicando IA na Aquicultura',
    'login.email':'E-mail','login.pass':'Senha','login.btn':'Entrar no sistema',
    'login.forgot':'Esqueceu sua senha?',
    'login.reset.title':'Recuperar Acesso',
    'login.reset.desc':'O Admin Pro receberá sua solicitação e gerará uma senha temporária.',
    'login.reset.send':'Enviar solicitação','login.back':'← Voltar ao login',
    'hmi.plant1':'Planta 1','hmi.plant2':'Planta 2',
    'hmi.vars':'Variáveis do Processo','hmi.cam':'Câmera ao Vivo',
    'hmi.chart':'Nível do Tanque — Últimos 30 min',
    'hmi.ctrl1':'Controle Planta 1','hmi.ctrl2':'Controle Planta 2',
    'hmi.cam.na':'Câmera indisponível','hmi.retry':'Tentar novamente',
    'ctrl.pump':'Bomba','ctrl.valve':'Eletroválvula',
    'ctrl.on':'Ligar','ctrl.off':'Desligar','ctrl.open':'Abrir','ctrl.close':'Fechar',
    'ctrl.on_s':'Ligada','ctrl.off_s':'Desligada','ctrl.open_s':'Aberta','ctrl.close_s':'Fechada',
    's.level':'Nível','s.flow':'Vazão','s.temp_a':'Temp. Ambiente','s.humid':'Umidade',
    's.temp_w':'Temp. Água','s.flo_lo':'Bóia Baixa','s.flo_hi':'Bóia Alta',
    's.active':'Ativo','s.normal':'Normal',
    'notif.title':'Notificações','notif.read_all':'Marcar lidas','notif.empty':'Sem notificações',
    'hist.title':'Histórico de Atividades','hist.from':'De','hist.to':'Até',
    'hist.filter':'Filtrar','hist.export':'Exportar Histórico CSV','hist.exp_lec':'Exportar Leituras CSV',
    'hist.date':'Data e hora','hist.action':'Ação','hist.user':'Usuário','hist.desc':'Descrição',
    'hist.empty':'Sem registros neste período','hist.system':'sistema',
    'com.title':'Comentários e Solicitações','com.new':'Nova solicitação','com.empty':'Sem solicitações ainda',
    'com.type':'Tipo','com.subject':'Assunto','com.justif':'Justificativa',
    'com.justif_ph':'Explique detalhadamente o motivo da sua solicitação...',
    'com.send':'Enviar','com.cancel':'Cancelar','com.reply':'Responder',
    'com.approve':'Aprovar','com.reject':'Rejeitar',
    'com.pending':'Pendente','com.answered':'Respondido','com.rejected':'Rejeitado',
    'com.from':'De','com.status':'Status','com.gen_token':'Gerar token de acesso ao editor',
    'com.duration':'Duração',
    'usr.title':'Gerenciar Usuários','usr.new':'Novo usuário','usr.email':'E-mail',
    'usr.username':'Nome de usuário','usr.pass':'Senha inicial','usr.role':'Função',
    'usr.status':'Status','usr.lastlogin':'Último login','usr.actions':'Ações',
    'usr.create':'Criar usuário','usr.active':'Ativo','usr.inactive':'Suspenso',
    'usr.suspend':'Suspender','usr.activate':'Ativar','usr.reset_pwd':'Resetar senha',
    'usr.change_role':'Mudar função',
    'g.logout':'Sair','g.myaccount':'Minha conta','g.loading':'Carregando...',
    'g.connecting':'Conectando...','g.save':'Salvar','g.min':'min','g.hour':'hora',
    'g.hours':'horas','g.never':'Nunca',
  },

  fr: {
    'nav.plant':'Plante','nav.history':'Historique','nav.comments':'Commentaires','nav.users':'Utilisateurs',
    'login.subtitle':'Transformation Numérique, Application de l\'IA en Aquaculture',
    'login.email':'Courriel','login.pass':'Mot de passe','login.btn':'Se connecter',
    'login.forgot':'Mot de passe oublié ?',
    'login.reset.title':'Récupérer l\'accès',
    'login.reset.desc':'L\'Admin Pro recevra votre demande et générera un mot de passe temporaire.',
    'login.reset.send':'Envoyer la demande','login.back':'← Retour',
    'hmi.plant1':'Usine 1','hmi.plant2':'Usine 2',
    'hmi.vars':'Variables du Procédé','hmi.cam':'Caméra en Direct',
    'hmi.chart':'Niveau du Réservoir — 30 dernières min',
    'hmi.ctrl1':'Contrôle Usine 1','hmi.ctrl2':'Contrôle Usine 2',
    'hmi.cam.na':'Caméra indisponible','hmi.retry':'Réessayer',
    'ctrl.pump':'Pompe','ctrl.valve':'Vanne solénoïde',
    'ctrl.on':'Allumer','ctrl.off':'Éteindre','ctrl.open':'Ouvrir','ctrl.close':'Fermer',
    'ctrl.on_s':'En marche','ctrl.off_s':'Arrêtée','ctrl.open_s':'Ouverte','ctrl.close_s':'Fermée',
    's.level':'Niveau','s.flow':'Débit','s.temp_a':'Temp. Ambiante','s.humid':'Humidité',
    's.temp_w':'Temp. Eau','s.flo_lo':'Flotteur Bas','s.flo_hi':'Flotteur Haut',
    's.active':'Actif','s.normal':'Normal',
    'notif.title':'Notifications','notif.read_all':'Tout marquer lu','notif.empty':'Aucune notification',
    'hist.title':'Journal d\'activité','hist.from':'Du','hist.to':'Au',
    'hist.filter':'Filtrer','hist.export':'Exporter CSV','hist.exp_lec':'Exporter Mesures CSV',
    'hist.date':'Date et heure','hist.action':'Action','hist.user':'Utilisateur','hist.desc':'Description',
    'hist.empty':'Aucun enregistrement','hist.system':'système',
    'com.title':'Commentaires et Demandes','com.new':'Nouvelle demande','com.empty':'Aucune demande',
    'com.type':'Type','com.subject':'Sujet','com.justif':'Justification',
    'com.justif_ph':'Expliquez en détail le motif de votre demande...',
    'com.send':'Envoyer','com.cancel':'Annuler','com.reply':'Répondre',
    'com.approve':'Approuver','com.reject':'Rejeter',
    'com.pending':'En attente','com.answered':'Répondu','com.rejected':'Rejeté',
    'com.from':'De','com.status':'Statut','com.gen_token':'Générer un token d\'accès',
    'com.duration':'Durée',
    'usr.title':'Gestion des Utilisateurs','usr.new':'Nouvel utilisateur','usr.email':'Courriel',
    'usr.username':'Nom d\'utilisateur','usr.pass':'Mot de passe initial','usr.role':'Rôle',
    'usr.status':'Statut','usr.lastlogin':'Dernière connexion','usr.actions':'Actions',
    'usr.create':'Créer','usr.active':'Actif','usr.inactive':'Suspendu',
    'usr.suspend':'Suspendre','usr.activate':'Activer','usr.reset_pwd':'Réinitialiser',
    'usr.change_role':'Changer le rôle',
    'g.logout':'Déconnexion','g.myaccount':'Mon compte','g.loading':'Chargement...',
    'g.connecting':'Connexion...','g.save':'Enregistrer','g.min':'min','g.hour':'heure',
    'g.hours':'heures','g.never':'Jamais',
  },

  de: {
    'nav.plant':'Anlage','nav.history':'Verlauf','nav.comments':'Kommentare','nav.users':'Benutzer',
    'login.subtitle':'Digitale Transformation, KI in der Aquakultur',
    'login.email':'E-Mail','login.pass':'Passwort','login.btn':'Anmelden',
    'login.forgot':'Passwort vergessen?',
    'login.reset.title':'Zugang wiederherstellen',
    'login.reset.desc':'Der Admin Pro erhält Ihre Anfrage und generiert ein temporäres Passwort.',
    'login.reset.send':'Anfrage senden','login.back':'← Zurück',
    'hmi.plant1':'Anlage 1','hmi.plant2':'Anlage 2',
    'hmi.vars':'Prozessvariablen','hmi.cam':'Live-Kamera',
    'hmi.chart':'Füllstand — Letzte 30 Min',
    'hmi.ctrl1':'Steuerung Anlage 1','hmi.ctrl2':'Steuerung Anlage 2',
    'hmi.cam.na':'Kamera nicht verfügbar','hmi.retry':'Erneut versuchen',
    'ctrl.pump':'Pumpe','ctrl.valve':'Magnetventil',
    'ctrl.on':'Einschalten','ctrl.off':'Ausschalten','ctrl.open':'Öffnen','ctrl.close':'Schließen',
    'ctrl.on_s':'Eingeschaltet','ctrl.off_s':'Ausgeschaltet','ctrl.open_s':'Geöffnet','ctrl.close_s':'Geschlossen',
    's.level':'Füllstand','s.flow':'Durchfluss','s.temp_a':'Umgebungstemp.','s.humid':'Luftfeuchtigkeit',
    's.temp_w':'Wassertemperatur','s.flo_lo':'Schwimmer unten','s.flo_hi':'Schwimmer oben',
    's.active':'Aktiv','s.normal':'Normal',
    'notif.title':'Benachrichtigungen','notif.read_all':'Alle gelesen','notif.empty':'Keine Benachrichtigungen',
    'hist.title':'Aktivitätsprotokoll','hist.from':'Von','hist.to':'Bis',
    'hist.filter':'Filtern','hist.export':'CSV exportieren','hist.exp_lec':'Messwerte exportieren',
    'hist.date':'Datum & Uhrzeit','hist.action':'Aktion','hist.user':'Benutzer','hist.desc':'Beschreibung',
    'hist.empty':'Keine Einträge','hist.system':'System',
    'com.title':'Kommentare & Anfragen','com.new':'Neue Anfrage','com.empty':'Keine Anfragen',
    'com.type':'Typ','com.subject':'Betreff','com.justif':'Begründung',
    'com.justif_ph':'Erläutern Sie den Grund Ihrer Anfrage...',
    'com.send':'Senden','com.cancel':'Abbrechen','com.reply':'Antworten',
    'com.approve':'Genehmigen','com.reject':'Ablehnen',
    'com.pending':'Ausstehend','com.answered':'Beantwortet','com.rejected':'Abgelehnt',
    'com.from':'Von','com.status':'Status','com.gen_token':'Zugangstoken generieren',
    'com.duration':'Dauer',
    'usr.title':'Benutzerverwaltung','usr.new':'Neuer Benutzer','usr.email':'E-Mail',
    'usr.username':'Benutzername','usr.pass':'Erstpasswort','usr.role':'Rolle',
    'usr.status':'Status','usr.lastlogin':'Letzter Login','usr.actions':'Aktionen',
    'usr.create':'Erstellen','usr.active':'Aktiv','usr.inactive':'Gesperrt',
    'usr.suspend':'Sperren','usr.activate':'Aktivieren','usr.reset_pwd':'Passwort zurücksetzen',
    'usr.change_role':'Rolle ändern',
    'g.logout':'Abmelden','g.myaccount':'Mein Konto','g.loading':'Laden...',
    'g.connecting':'Verbinden...','g.save':'Speichern','g.min':'Min','g.hour':'Stunde',
    'g.hours':'Stunden','g.never':'Nie',
  },

  it: {
    'nav.plant':'Impianto','nav.history':'Storico','nav.comments':'Commenti','nav.users':'Utenti',
    'login.subtitle':'Trasformazione Digitale, IA in Acquacoltura',
    'login.email':'E-mail','login.pass':'Password','login.btn':'Accedi al sistema',
    'login.forgot':'Password dimenticata?',
    'login.reset.title':'Recupera accesso',
    'login.reset.desc':'L\'Admin Pro riceverà la tua richiesta e genererà una password temporanea.',
    'login.reset.send':'Invia richiesta','login.back':'← Torna al login',
    'hmi.plant1':'Impianto 1','hmi.plant2':'Impianto 2',
    'hmi.vars':'Variabili di Processo','hmi.cam':'Telecamera dal Vivo',
    'hmi.chart':'Livello del Serbatoio — Ultimi 30 min',
    'hmi.ctrl1':'Controllo Impianto 1','hmi.ctrl2':'Controllo Impianto 2',
    'hmi.cam.na':'Telecamera non disponibile','hmi.retry':'Riprova',
    'ctrl.pump':'Pompa','ctrl.valve':'Elettrovalvola',
    'ctrl.on':'Accendi','ctrl.off':'Spegni','ctrl.open':'Apri','ctrl.close':'Chiudi',
    'ctrl.on_s':'Accesa','ctrl.off_s':'Spenta','ctrl.open_s':'Aperta','ctrl.close_s':'Chiusa',
    's.level':'Livello','s.flow':'Portata','s.temp_a':'Temp. Ambiente','s.humid':'Umidità',
    's.temp_w':'Temp. Acqua','s.flo_lo':'Galleggiante Basso','s.flo_hi':'Galleggiante Alto',
    's.active':'Attivo','s.normal':'Normale',
    'notif.title':'Notifiche','notif.read_all':'Segna tutte lette','notif.empty':'Nessuna notifica',
    'hist.title':'Registro Attività','hist.from':'Da','hist.to':'A',
    'hist.filter':'Filtra','hist.export':'Esporta CSV','hist.exp_lec':'Esporta Letture CSV',
    'hist.date':'Data e ora','hist.action':'Azione','hist.user':'Utente','hist.desc':'Descrizione',
    'hist.empty':'Nessun record','hist.system':'sistema',
    'com.title':'Commenti e Richieste','com.new':'Nuova richiesta','com.empty':'Nessuna richiesta',
    'com.type':'Tipo','com.subject':'Oggetto','com.justif':'Giustificazione',
    'com.justif_ph':'Spiega in dettaglio il motivo della tua richiesta...',
    'com.send':'Invia','com.cancel':'Annulla','com.reply':'Rispondi',
    'com.approve':'Approva','com.reject':'Rifiuta',
    'com.pending':'In attesa','com.answered':'Risposto','com.rejected':'Rifiutato',
    'com.from':'Da','com.status':'Stato','com.gen_token':'Genera token di accesso',
    'com.duration':'Durata',
    'usr.title':'Gestione Utenti','usr.new':'Nuovo utente','usr.email':'E-mail',
    'usr.username':'Nome utente','usr.pass':'Password iniziale','usr.role':'Ruolo',
    'usr.status':'Stato','usr.lastlogin':'Ultimo accesso','usr.actions':'Azioni',
    'usr.create':'Crea utente','usr.active':'Attivo','usr.inactive':'Sospeso',
    'usr.suspend':'Sospendi','usr.activate':'Attiva','usr.reset_pwd':'Reset pwd',
    'usr.change_role':'Cambia ruolo',
    'g.logout':'Disconnetti','g.myaccount':'Il mio account','g.loading':'Caricamento...',
    'g.connecting':'Connessione...','g.save':'Salva','g.min':'min','g.hour':'ora',
    'g.hours':'ore','g.never':'Mai',
  },

  zh: {
    'nav.plant':'工厂','nav.history':'历史记录','nav.comments':'评论','nav.users':'用户',
    'login.subtitle':'数字化转型，人工智能应用于水产养殖',
    'login.email':'邮箱','login.pass':'密码','login.btn':'登录系统',
    'login.forgot':'忘记密码？',
    'login.reset.title':'恢复访问',
    'login.reset.desc':'管理员将收到您的请求并生成临时密码。',
    'login.reset.send':'发送请求','login.back':'← 返回登录',
    'hmi.plant1':'工厂 1','hmi.plant2':'工厂 2',
    'hmi.vars':'过程变量','hmi.cam':'实时摄像头',
    'hmi.chart':'液位 — 最近30分钟',
    'hmi.ctrl1':'工厂 1 控制','hmi.ctrl2':'工厂 2 控制',
    'hmi.cam.na':'摄像头不可用','hmi.retry':'重试',
    'ctrl.pump':'泵','ctrl.valve':'电磁阀',
    'ctrl.on':'开启','ctrl.off':'关闭','ctrl.open':'打开','ctrl.close':'关闭',
    'ctrl.on_s':'运行中','ctrl.off_s':'已停止','ctrl.open_s':'已打开','ctrl.close_s':'已关闭',
    's.level':'液位','s.flow':'流量','s.temp_a':'环境温度','s.humid':'湿度',
    's.temp_w':'水温','s.flo_lo':'低液位浮标','s.flo_hi':'高液位浮标',
    's.active':'激活','s.normal':'正常',
    'notif.title':'通知','notif.read_all':'全部标记已读','notif.empty':'无通知',
    'hist.title':'活动日志','hist.from':'从','hist.to':'至',
    'hist.filter':'筛选','hist.export':'导出历史CSV','hist.exp_lec':'导出读数CSV',
    'hist.date':'日期和时间','hist.action':'操作','hist.user':'用户','hist.desc':'描述',
    'hist.empty':'此期间无记录','hist.system':'系统',
    'com.title':'评论和请求','com.new':'新请求','com.empty':'暂无请求',
    'com.type':'类型','com.subject':'主题','com.justif':'说明',
    'com.justif_ph':'请详细说明请求原因...',
    'com.send':'发送','com.cancel':'取消','com.reply':'回复',
    'com.approve':'批准','com.reject':'拒绝',
    'com.pending':'待处理','com.answered':'已回复','com.rejected':'已拒绝',
    'com.from':'来自','com.status':'状态','com.gen_token':'生成访问令牌',
    'com.duration':'时长',
    'usr.title':'用户管理','usr.new':'新用户','usr.email':'邮箱',
    'usr.username':'用户名','usr.pass':'初始密码','usr.role':'角色',
    'usr.status':'状态','usr.lastlogin':'最后登录','usr.actions':'操作',
    'usr.create':'创建用户','usr.active':'活跃','usr.inactive':'已暂停',
    'usr.suspend':'暂停','usr.activate':'激活','usr.reset_pwd':'重置密码',
    'usr.change_role':'更改角色',
    'g.logout':'退出','g.myaccount':'我的账户','g.loading':'加载中...',
    'g.connecting':'连接中...','g.save':'保存','g.min':'分钟','g.hour':'小时',
    'g.hours':'小时','g.never':'从未',
  },

  ja: {
    'nav.plant':'プラント','nav.history':'履歴','nav.comments':'コメント','nav.users':'ユーザー',
    'login.subtitle':'デジタル変革、水産養殖へのAI適用',
    'login.email':'メールアドレス','login.pass':'パスワード','login.btn':'システムにログイン',
    'login.forgot':'パスワードをお忘れですか？',
    'login.reset.title':'アクセスを回復',
    'login.reset.desc':'Admin Proがリクエストを受け取り、一時的なパスワードを生成します。',
    'login.reset.send':'リクエストを送信','login.back':'← ログインに戻る',
    'hmi.plant1':'プラント 1','hmi.plant2':'プラント 2',
    'hmi.vars':'プロセス変数','hmi.cam':'ライブカメラ',
    'hmi.chart':'タンクレベル — 過去30分',
    'hmi.ctrl1':'プラント 1 制御','hmi.ctrl2':'プラント 2 制御',
    'hmi.cam.na':'カメラが利用できません','hmi.retry':'再試行',
    'ctrl.pump':'ポンプ','ctrl.valve':'電磁弁',
    'ctrl.on':'オン','ctrl.off':'オフ','ctrl.open':'開く','ctrl.close':'閉じる',
    'ctrl.on_s':'稼働中','ctrl.off_s':'停止','ctrl.open_s':'開いている','ctrl.close_s':'閉じている',
    's.level':'レベル','s.flow':'流量','s.temp_a':'周囲温度','s.humid':'湿度',
    's.temp_w':'水温','s.flo_lo':'低水位フロート','s.flo_hi':'高水位フロート',
    's.active':'アクティブ','s.normal':'正常',
    'notif.title':'通知','notif.read_all':'すべて既読','notif.empty':'通知なし',
    'hist.title':'アクティビティログ','hist.from':'開始日','hist.to':'終了日',
    'hist.filter':'フィルター','hist.export':'履歴CSVエクスポート','hist.exp_lec':'読み値CSVエクスポート',
    'hist.date':'日時','hist.action':'アクション','hist.user':'ユーザー','hist.desc':'説明',
    'hist.empty':'この期間の記録なし','hist.system':'システム',
    'com.title':'コメントとリクエスト','com.new':'新しいリクエスト','com.empty':'リクエストなし',
    'com.type':'タイプ','com.subject':'件名','com.justif':'理由',
    'com.justif_ph':'リクエストの理由を詳しく説明してください...',
    'com.send':'送信','com.cancel':'キャンセル','com.reply':'返信',
    'com.approve':'承認','com.reject':'拒否',
    'com.pending':'保留中','com.answered':'回答済み','com.rejected':'拒否済み',
    'com.from':'送信者','com.status':'ステータス','com.gen_token':'アクセストークンを生成',
    'com.duration':'期間',
    'usr.title':'ユーザー管理','usr.new':'新しいユーザー','usr.email':'メールアドレス',
    'usr.username':'ユーザー名','usr.pass':'初期パスワード','usr.role':'役割',
    'usr.status':'ステータス','usr.lastlogin':'最終ログイン','usr.actions':'アクション',
    'usr.create':'ユーザーを作成','usr.active':'アクティブ','usr.inactive':'停止',
    'usr.suspend':'停止','usr.activate':'有効化','usr.reset_pwd':'パスワードリセット',
    'usr.change_role':'役割を変更',
    'g.logout':'ログアウト','g.myaccount':'マイアカウント','g.loading':'読み込み中...',
    'g.connecting':'接続中...','g.save':'保存','g.min':'分','g.hour':'時間',
    'g.hours':'時間','g.never':'なし',
  },
};

// ================================================================
// APLICAR TRADUCCIONES
// ================================================================
function getLang() {
  return localStorage.getItem('hmi_lang') || 'es';
}

function t(key) {
  const lang = getLang();
  return (T[lang] && T[lang][key]) || (T['es'] && T['es'][key]) || key;
}

function aplicarIdioma(codigo) {
  if (!T[codigo]) return;
  localStorage.setItem('hmi_lang', codigo);
  // Cerrar menú
  const m = document.getElementById('langMenu');
  if (m) m.style.display = 'none';
  // Actualizar botón visible
  const info = IDIOMAS[codigo];
  if (info) {
    const btn = document.getElementById('langBtn');
    if (btn) {
      btn.innerHTML = `<span class="fi fi-${info.fi}" style="border-radius:2px;width:18px;height:12px;display:inline-block"></span><span class="lang-nombre">${info.nombre}</span><i class="fa-solid fa-chevron-down" style="font-size:9px;color:var(--muted)"></i>`;
    }
  }
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = T[codigo][key] || T['es'][key] || key;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.dataset.i18nTarget === 'placeholder') el.placeholder = val;
      else el.value = val;
    } else {
      el.textContent = val;
    }
  });
  // Actualizar el selector visible
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = codigo;
}

function initIdioma() {
  aplicarIdioma(getLang());
}

// ================================================================
// SELECTOR DE IDIOMA (HTML del dropdown)
// ================================================================
function crearSelectorIdioma() {
  const actual = getLang();
  const info = IDIOMAS[actual] || IDIOMAS['es'];
  const html = `
    <div style="position:relative">
      <div onclick="toggleLangMenu()" id="langBtn"
           style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
                  color:#c5d0da;padding:5px 10px;border-radius:8px;
                  font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;
                  white-space:nowrap;user-select:none">
        <span class="fi fi-${info.fi}" style="border-radius:2px;width:18px;height:12px;display:inline-block"></span>
        <span class="lang-nombre">${info.nombre}</span>
        <i class="fa-solid fa-chevron-down" style="font-size:9px;color:var(--muted)"></i>
      </div>
      <div id="langMenu" style="display:none;position:absolute;top:calc(100% + 6px);right:0;
           background:var(--panel);border:1px solid var(--border2);border-radius:10px;
           box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:9999;min-width:160px;overflow:hidden">
        ${Object.entries(IDIOMAS).map(([code,info2])=>`
          <div onclick="aplicarIdioma('${code}')" data-lang="${code}"
               style="padding:9px 14px;display:flex;align-items:center;gap:9px;cursor:pointer;
                      font-size:12px;font-weight:500;transition:.1s"
               onmouseover="this.style.background='rgba(0,180,216,.1)'"
               onmouseout="this.style.background='transparent'">
            <span class="fi fi-${info2.fi}" style="border-radius:2px;width:20px;height:14px;display:inline-block;flex-shrink:0"></span>
            ${info2.nombre}
          </div>`).join('')}
      </div>
    </div>`;
  return html;
}

function toggleLangMenu() {
  const m = document.getElementById('langMenu');
  if (!m) return;
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

// Cerrar menú de idioma al click fuera
document.addEventListener('click', e => {
  if (!e.target.closest('#langBtn') && !e.target.closest('#langMenu')) {
    const m = document.getElementById('langMenu');
    if (m) m.style.display = 'none';
  }
});

// Inicializar todo al cargar
document.addEventListener('DOMContentLoaded', () => {
  initTema();
  initIdioma();
});


// ================================================================
// PANEL DE CONFIGURACIÓN DEL SISTEMA (versión limpia, sin template nested)
// ================================================================

function formatFecha(dateStr) {
  const fmt = localStorage.getItem('hmi_date_fmt') || 'es';
  const d = new Date(dateStr);
  if (fmt === 'en')  return d.toLocaleString('en-US');
  if (fmt === 'iso') return d.toISOString().slice(0,16).replace('T',' ');
  return d.toLocaleString('es-ES');
}

function notifActivo() {
  return localStorage.getItem('hmi_notif') !== 'off';
}

function setDateFmt(fmt) {
  localStorage.setItem('hmi_date_fmt', fmt);
}

function mostrarToast(titulo, msg) {
  if (!notifActivo()) return;
  const t = document.createElement('div');
  t.className = 'toast-notif';
  t.innerHTML = '<i class="fa-solid fa-bell"></i><div><div class="toast-title">' +
    titulo + '</div><div class="toast-msg">' + msg + '</div></div>';
  document.body.appendChild(t);
  setTimeout(function(){ t.classList.add('show'); }, 50);
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 350); }, 4500);
}

function buildLangBtns() {
  var html = '';
  var actual = getLang();
  var entries = Object.keys(IDIOMAS);
  for (var i = 0; i < entries.length; i++) {
    var code = entries[i];
    var info = IDIOMAS[code];
    var isActive = (code === actual);
    html += '<button data-lang="' + code + '" ' +
      'style="display:flex;align-items:center;gap:7px;padding:7px 12px;' +
      'border-radius:8px;border:1px solid ' + (isActive ? 'var(--accent)' : 'var(--border2)') + ';' +
      'background:' + (isActive ? 'rgba(var(--accent-rgb),.12)' : 'var(--panel2)') + ';' +
      'color:' + (isActive ? 'var(--accent)' : 'var(--muted)') + ';' +
      'cursor:pointer;font-size:12px;transition:.15s">' +
      '<span class="fi fi-' + info.fi + '" style="border-radius:2px;width:20px;height:14px;display:inline-block;flex-shrink:0"></span>' +
      info.nombre + '</button>';
  }
  return html;
}

function abrirPanelConfig() {
  // Cerrar modal de usuario si está abierto
  var mu = document.getElementById('modalUser');
  if (mu) mu.style.display = 'none';

  // Quitar panel viejo si existe
  var viejo = document.getElementById('cfgPanel');
  if (viejo) viejo.remove();
  var viejoBg = document.getElementById('cfgBg');
  if (viejoBg) viejoBg.remove();

  // Backdrop
  var bg = document.createElement('div');
  bg.id = 'cfgBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:8900;backdrop-filter:blur(2px)';
  bg.onclick = cerrarPanelConfig;
  document.body.appendChild(bg);

  var temaDark = (localStorage.getItem('hmi_tema') || 'dark') === 'dark';
  var notifOn  = notifActivo();

  // Panel
  var panel = document.createElement('div');
  panel.id = 'cfgPanel';
  panel.className = 'config-panel';
  panel.style.zIndex = '8901';
  panel.innerHTML =
    '<div class="config-head">' +
      '<h3><i class="fa-solid fa-gear"></i> Configuración</h3>' +
      '<button class="btn-close" onclick="cerrarPanelConfig()"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>' +
    '<div class="config-body">' +

      // APARIENCIA
      '<div class="config-section-title"><i class="fa-solid fa-palette"></i> Apariencia</div>' +
      '<div class="toggle-row">' +
        '<div class="toggle-label"><i class="fa-solid fa-moon"></i>' +
          '<div><div>Tema oscuro</div><div class="sub">Alterna entre oscuro y claro</div></div>' +
        '</div>' +
        '<label class="toggle-switch">' +
          '<input type="checkbox" id="cfgTemaSwitch" ' + (temaDark ? 'checked' : '') + '>' +
          '<div class="toggle-track"></div>' +
        '</label>' +
      '</div>' +

      // IDIOMA
      '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-globe"></i> Idioma</div>' +
      '<div id="cfgLangBtns" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px">' +
        buildLangBtns() +
      '</div>' +

      // NOTIFICACIONES
      '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-bell"></i> Notificaciones</div>' +
      '<div class="toggle-row">' +
        '<div class="toggle-label"><i class="fa-solid fa-bell-slash"></i>' +
          '<div><div>Alertas emergentes</div><div class="sub">Popups al recibir notificaciones nuevas</div></div>' +
        '</div>' +
        '<label class="toggle-switch">' +
          '<input type="checkbox" id="cfgNotifSwitch" ' + (notifOn ? 'checked' : '') + '>' +
          '<div class="toggle-track"></div>' +
        '</label>' +
      '</div>' +

      // ZONA HORARIA
      '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-earth-americas"></i> Zona Horaria y Reloj</div>' +
      '<div id="cfgTzSection">' + buildZonaHorariaHTML() + '</div>' +

      // ACERCA DE
      '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-circle-info"></i> Acerca del sistema</div>' +
      '<div style="background:var(--panel2);border-radius:10px;padding:14px;font-size:12px;line-height:2;border:1px solid var(--border)">' +
        '<div><i class="fa-solid fa-fish" style="color:var(--accent);width:16px"></i> <strong>Sistema:</strong> HMI — Acuicultura Digital Inteligente</div>' +
        '<div><i class="fa-solid fa-tag" style="color:var(--accent);width:16px"></i> <strong>Versión:</strong> v2.0 Prototipo</div>' +
        '<div><i class="fa-solid fa-graduation-cap" style="color:var(--accent);width:16px"></i> <strong>Institución:</strong> UPSE</div>' +
        '<div><i class="fa-solid fa-microchip" style="color:var(--accent);width:16px"></i> <strong>Materia:</strong> Automatización Industrial II</div>' +
        '<div><i class="fa-solid fa-calendar" style="color:var(--accent);width:16px"></i> <strong>Año:</strong> 2026</div>' +
      '</div>' +

    '</div>';

  document.body.appendChild(panel);

  // Eventos DESPUÉS de agregar al DOM
  document.getElementById('cfgTemaSwitch').addEventListener('change', function() {
    aplicarTema(this.checked ? 'dark' : 'light');
  });

  document.getElementById('cfgNotifSwitch').addEventListener('change', function() {
    localStorage.setItem('hmi_notif', this.checked ? 'on' : 'off');
  });

  panel.querySelectorAll('[data-lang]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      aplicarIdioma(btn.getAttribute('data-lang'));
      panel.querySelectorAll('[data-lang]').forEach(function(b) {
        var isThis = b === btn;
        b.style.borderColor  = isThis ? 'var(--accent)' : 'var(--border2)';
        b.style.color        = isThis ? 'var(--accent)' : 'var(--muted)';
        b.style.background   = isThis ? 'rgba(var(--accent-rgb),.12)' : 'var(--panel2)';
      });
    });
  });

  // Zona horaria: input numérico
  var tzInput = panel.querySelector('#cfgTzInput');
  if (tzInput) {
    var tzTimer = setInterval(function(){ actualizarPreviewTz(panel); }, 1000);
    actualizarPreviewTz(panel);
    tzInput.addEventListener('change', function() {
      var v = parseFloat(this.value);
      if (isNaN(v) || v < -12 || v > 14) return;
      localStorage.setItem('hmi_tz_offset', v);
      actualizarPreviewTz(panel);
    });
    // Botones preset
    panel.querySelectorAll('[data-tzpreset]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var v = parseFloat(btn.getAttribute('data-tzpreset'));
        localStorage.setItem('hmi_tz_offset', v);
        if (tzInput) tzInput.value = v;
        actualizarPreviewTz(panel);
        panel.querySelectorAll('[data-tzpreset]').forEach(function(b) {
          var on = b === btn;
          b.style.borderColor = on ? 'var(--accent)' : 'var(--border2)';
          b.style.color       = on ? 'var(--accent)' : 'var(--muted)';
          b.style.background  = on ? 'rgba(20,184,166,.12)' : 'var(--panel2)';
        });
      });
    });
    // Limpiar timer al cerrar
    panel.addEventListener('remove', function(){ clearInterval(tzTimer); });
  }

  setTimeout(function() { panel.classList.add('open'); }, 10);
  document.body.style.overflow = 'hidden';
}

function cerrarPanelConfig() {
  var p  = document.getElementById('cfgPanel');
  var bg = document.getElementById('cfgBg');
  if (p)  { p.classList.remove('open'); setTimeout(function(){ p.remove(); }, 320); }
  if (bg) { bg.style.display = 'none'; setTimeout(function(){ bg.remove(); }, 320); }
  document.body.style.overflow = '';
}

// ================================================================
// RELOJ EN TIEMPO REAL
// ================================================================

function getHoraAjustada() {
  var offset = parseFloat(localStorage.getItem('hmi_tz_offset') || '-5');
  var utcMs  = Date.now() + (new Date().getTimezoneOffset() * 60000);
  return new Date(utcMs + offset * 3600000);
}

function iniciarReloj() {
  if (document.getElementById('relojWidget')) return;

  var widget = document.createElement('div');
  widget.id  = 'relojWidget';
  document.body.appendChild(widget);

  var DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function tick() {
    var d   = getHoraAjustada();
    var hh  = String(d.getHours()).padStart(2,'0');
    var mm  = String(d.getMinutes()).padStart(2,'0');
    var ss  = String(d.getSeconds()).padStart(2,'0');
    var dia = DIAS[d.getDay()];
    var num = d.getDate();
    var mes = MESES[d.getMonth()];
    var anio= d.getFullYear();

    widget.innerHTML =
      '<div class="hora">' + hh + ':' + mm + ':' + ss + '</div>' +
      '<div class="fecha">' + dia + ', ' + num + ' de ' + mes + ' de ' + anio + '</div>';
  }

  tick();
  setInterval(tick, 1000);
}

// ================================================================
// ZONA HORARIA en configuración
// ================================================================

function buildZonaHorariaHTML() {
  var actual = parseFloat(localStorage.getItem('hmi_tz_offset') || '-5');

  var presets = [
    { lbl: 'Ecuador (UTC-5)',    v: -5  },
    { lbl: 'Colombia (UTC-5)',   v: -5  },
    { lbl: 'Argentina (UTC-3)', v: -3  },
    { lbl: 'España (UTC+2)',    v:  2  },
    { lbl: 'UTC 0',             v:  0  },
    { lbl: 'China (UTC+8)',     v:  8  },
  ];

  var btnsHtml = '';
  presets.forEach(function(p) {
    var on = (p.v === actual);
    btnsHtml += '<button data-tzpreset="' + p.v + '" ' +
      'style="padding:6px 10px;border-radius:7px;border:1px solid ' +
      (on ? 'var(--accent)' : 'var(--border2)') + ';background:' +
      (on ? 'rgba(20,184,166,.12)' : 'var(--panel2)') + ';color:' +
      (on ? 'var(--accent)' : 'var(--muted)') + ';cursor:pointer;font-size:11px;' +
      'font-weight:600;transition:.15s;">' + p.lbl + '</button>';
  });

  return '<div style="margin-bottom:10px">' +
    '<label style="font-size:11px;color:var(--muted);font-weight:700;display:block;margin-bottom:6px">' +
    'Ajuste UTC (ejemplo: Ecuador = -5, España = +2)</label>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<input type="number" id="cfgTzInput" min="-12" max="14" step="1" value="' + actual + '" ' +
      'style="width:70px;padding:8px;border:1px solid var(--border2);border-radius:8px;' +
      'background:var(--bg2);color:var(--text);font-size:14px;font-weight:700;text-align:center">' +
      '<span style="font-size:12px;color:var(--muted)">horas respecto a UTC</span>' +
    '</div>' +
    '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">' + btnsHtml + '</div>' +
    '</div>' +
    '<div id="cfgTzPreview" style="background:var(--panel2);border-radius:8px;padding:10px 14px;' +
    'border:1px solid var(--border);font-family:monospace;font-size:13px;font-weight:700;' +
    'color:var(--accent)">Hora actual calculada...</div>';
}

function actualizarPreviewTz(panel) {
  var d   = getHoraAjustada();
  var hh  = String(d.getHours()).padStart(2,'0');
  var mm  = String(d.getMinutes()).padStart(2,'0');
  var ss  = String(d.getSeconds()).padStart(2,'0');
  var preview = panel.querySelector('#cfgTzPreview');
  if (preview) {
    preview.textContent = hh + ':' + mm + ':' + ss + '  —  ' +
      d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
  }
}
