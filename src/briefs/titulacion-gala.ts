import type { BriefDefinition } from './types';

// Brief corto para una titulación: evento formal y "plug and play" (se escanea el
// QR en el lugar y se sacan fotos). Solo pregunta lo que cambia la cámara:
// colores, letras, textos de los marcos, estilo de marco y emojis extra.
const titulacionGala: BriefDefinition = {
  slug: 'titulacion-gala',
  title: 'Tu titulación, tu estilo',
  intro:
    'Elige lo que más te guste en cada pregunta. Lo que elijas primero (colores, letras y textos) se aplica en las vistas previas de las preguntas siguientes. Siempre puedes escribir lo que quieras en la nota. Con esto armamos tu cámara y tus marcos.',
  questions: [
    {
      id: 'paleta',
      title: '¿Qué paleta de colores prefieres?',
      help: 'Se aplica en toda la cámara y en los marcos.',
      selection: 'single',
      visual: 'palette',
      options: [
        {
          id: 'gala',
          label: 'Negro, dorado y rojo',
          hint: 'Sobria y elegante.',
          palette: { bg: '#0e0c0b', accent: '#c9a55a', soft: '#7a1f1c', text: '#f4eee3' },
        },
        {
          id: 'champagne',
          label: 'Champagne y rosa empolvado',
          hint: 'Tonos pastel sobre negro.',
          palette: { bg: '#121014', accent: '#e8c9b5', soft: '#6b4e5a', text: '#f5eee8' },
        },
        {
          id: 'vino-dorado',
          label: 'Rojo vino y dorado',
          palette: { bg: '#1a0b10', accent: '#c9a24b', soft: '#6d0f26', text: '#f6ead0' },
        },
        {
          id: 'negro-hueso',
          label: 'Negro y blanco hueso',
          hint: 'Minimalista.',
          palette: { bg: '#0e0e0e', accent: '#f2efe6', soft: '#3a3a3a', text: '#f2efe6' },
        },
      ],
      notePlaceholder: 'Un color que no puede faltar o que no quieres...',
    },
    {
      id: 'titulos',
      title: '¿Cómo se ven las letras?',
      help: 'Son las letras que puede usar la cámara. Se ven con tu paleta.',
      selection: 'single',
      visual: 'font',
      options: [
        { id: 'serifa', label: 'Clásica', hint: 'Elegante, con serifa.', font: 'serif' },
        { id: 'firma', label: 'Manuscrita', hint: 'Cursiva, como firma.', font: 'hand' },
        { id: 'cartel', label: 'Titular', hint: 'Gruesas, de cartel.', font: 'display' },
        { id: 'moderna', label: 'Moderna', font: 'sans' },
      ],
    },
    {
      id: 'textos',
      title: '¿Qué dicen los marcos?',
      help: 'Lo que escribas aparece en las vistas previas de abajo.',
      selection: 'single',
      options: [],
      fields: [
        { id: 'nombre', label: 'Nombre', placeholder: 'Como quieres que aparezca' },
        { id: 'titulo', label: 'Carrera o título', placeholder: 'Ej: Ingeniería Comercial' },
        { id: 'fecha', label: 'Fecha', placeholder: 'Ej: 7 de noviembre' },
        { id: 'frase', label: 'Frase o hashtag (opcional)', placeholder: 'Lo que quieras que lleve' },
      ],
    },
    {
      id: 'marcos',
      title: '¿Qué estilo de marco te gusta?',
      help: 'Elige hasta dos. El diseño final se hace con lo que elijas.',
      selection: 'multi',
      max: 2,
      options: [
        {
          id: 'laureles',
          label: 'Laureles',
          hint: 'Ramas de laurel doradas en las esquinas y un birrete.',
        },
        {
          id: 'art-deco',
          label: 'Art déco',
          hint: 'Marco fino dorado con esquinas geométricas.',
        },
        {
          id: 'diploma',
          label: 'Diploma',
          hint: 'Diploma con cinta roja, birrete al aire y confeti dorado.',
        },
        { id: 'privado', label: 'Lo conversamos en privado', hint: 'No elijo ahora.', exclusive: true },
      ],
      notePlaceholder: 'Algo que hayas visto y te guste, o cómo imaginas el tuyo...',
    },
    {
      id: 'stickers',
      title: 'Además de tus stickers, ¿sumamos emojis?',
      selection: 'multi',
      visual: 'emoji',
      options: [
        { id: 'graduacion', label: 'Graduación', glyphs: '🎓📜🏅' },
        { id: 'brindis', label: 'Brindis y brillos', glyphs: '🥂🍾✨' },
        { id: 'corazones', label: 'Corazones y flores', glyphs: '❤️🌹💐' },
        { id: 'ninguno', label: 'Solo mis stickers', glyphs: '🚫', exclusive: true },
      ],
    },
    {
      id: 'evitar',
      title: '¿Qué NO quieres que se vea?',
      selection: 'single',
      options: [],
      notePlaceholder: 'Colores, estilos o cosas que no te gustan...',
    },
    {
      id: 'referencias',
      title: '¿Tienes referencias?',
      help: 'Links, cuentas de Instagram, fotos.',
      selection: 'single',
      options: [],
      notePlaceholder: 'Pega aquí lo que tengas.',
    },
  ],
};

export default titulacionGala;
