import type { BriefDefinition } from './types';

// Borrador de opciones para el cumpleaños de disfraces de Francisca. Son
// propuestas para que ella elija; cada pregunta deja además una nota libre.
// El orden importa: lo que se elige primero (paleta, letras, textos) se aplica
// en las vistas previas de las preguntas siguientes.
const francisca: BriefDefinition = {
  slug: 'francisca',
  title: 'Tu cumpleaños, tu estilo',
  intro:
    'Elige lo que más te guste en cada pregunta. Lo que elijas primero (colores, letras y textos) se aplica en las vistas previas de las preguntas siguientes. Puedes marcar varias donde se indique y siempre puedes escribir lo que quieras en la nota. Nada es definitivo: es para armar tu cámara y tus marcos.',
  questions: [
    {
      id: 'paleta',
      title: '¿Qué paleta de colores te late?',
      help: 'Se aplica en todo lo que sigue.',
      selection: 'single',
      visual: 'palette',
      options: [
        {
          id: 'rosa-negro',
          label: 'Rosa chicle y negro',
          palette: { bg: '#150a12', accent: '#ff5fa2', soft: '#5a1f3d', text: '#fff0f6' },
        },
        {
          id: 'vino-dorado',
          label: 'Rojo vino y dorado',
          palette: { bg: '#1a0b10', accent: '#c9a24b', soft: '#6d0f26', text: '#f6ead0' },
        },
        {
          id: 'ciruela-plata',
          label: 'Ciruela y plata',
          palette: { bg: '#14091a', accent: '#b9bcc7', soft: '#4a1d5c', text: '#f1eef7' },
        },
        {
          id: 'negro-hueso',
          label: 'Negro y blanco hueso',
          palette: { bg: '#0e0e0e', accent: '#f2efe6', soft: '#3a3a3a', text: '#f2efe6' },
        },
        {
          id: 'calabaza',
          label: 'Negro con un toque de naranja',
          palette: { bg: '#0e0e0e', accent: '#ff7a1a', soft: '#3a2a1a', text: '#fff3e6' },
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
        { id: 'cartel', label: 'Titular', hint: 'Gruesas, de cartel.', font: 'display' },
        { id: 'serifa', label: 'Clásica', hint: 'Elegante, con serifa.', font: 'serif' },
        { id: 'maquina', label: 'Máquina de escribir', font: 'typewriter' },
        { id: 'firma', label: 'Manuscrita', hint: 'Cursiva, como firma.', font: 'hand' },
        { id: 'moderna', label: 'Moderna', font: 'sans' },
        { id: 'tecnica', label: 'Técnica', font: 'mono' },
      ],
    },
    {
      id: 'textos',
      title: '¿Qué dicen los marcos?',
      help: 'Lo que escribas aparece en las vistas previas de abajo.',
      selection: 'single',
      options: [],
      fields: [
        { id: 'nombre', label: 'Nombre', placeholder: 'Francisca' },
        { id: 'fecha', label: 'Fecha', placeholder: 'Ej: 31 de octubre' },
        { id: 'frase', label: 'Frase o hashtag (opcional)', placeholder: 'Lo que quieras que lleve' },
      ],
    },
    {
      id: 'ambiente',
      title: '¿Qué ambiente tiene que tener la fiesta?',
      help: 'Elige hasta dos. Las vistas usan tu paleta.',
      selection: 'multi',
      max: 2,
      visual: 'ambiente',
      options: [
        { id: 'meangirls', label: 'Carrete de disfraces con actitud', hint: 'Pose, brillo y orejas de conejita.' },
        { id: 'club', label: 'Club de noche', hint: 'Oscuro, elegante y un poco peligroso.' },
        { id: 'gala', label: 'Gala de terror glam', hint: 'Terciopelo, cortinas y dorado.' },
        { id: 'mascarada', label: 'Mascarada', hint: 'Antifaces, plumas y misterio.' },
        { id: 'retro', label: 'Cine de terror retro', hint: 'Cinta VHS, REC y humor.' },
      ],
      notePlaceholder: 'Otra idea, una película, una escena...',
    },
    {
      id: 'marcos',
      title: '¿Qué marcos para las fotos?',
      help: 'Son solo referencias para que veas el estilo: el diseño de cada marco se hace después. Marcamos los dos que conversamos primero; abajo hay otros ejemplos. Se ven con tu paleta, tus letras y tus textos.',
      selection: 'multi',
      visual: 'frame',
      options: [
        {
          id: 'cumple',
          label: 'Mi cumpleaños',
          hint: 'Con tu nombre y la fecha.',
          frame: 'banner',
        },
        {
          id: 'conejita',
          label: 'Halloween estilo Mean Girls',
          hint: 'Orejas de conejita, antifaz y bodies. Se diseña a medida.',
          frame: 'conejita',
        },
        { id: 'polaroid', label: 'Polaroid', hint: 'Ejemplo: marco blanco con tu nombre.', frame: 'polaroid' },
        { id: 'film', label: 'Rollo de cine', hint: 'Ejemplo: franja con la fecha.', frame: 'film' },
        { id: 'viewfinder', label: 'Visor de cámara', hint: 'Ejemplo: esquinas y REC.', frame: 'viewfinder' },
        { id: 'glow', label: 'Destello de color', hint: 'Ejemplo: degradé en los bordes.', frame: 'glow' },
        { id: 'privado', label: 'Lo conversamos en privado', hint: 'No elijo ahora.', exclusive: true },
      ],
      notePlaceholder: 'Algo que hayas visto y te guste, o cómo imaginas el tuyo...',
    },
    {
      id: 'stickers',
      title: '¿Qué stickers quieres para sumar a las fotos?',
      selection: 'multi',
      visual: 'emoji',
      options: [
        { id: 'disfraces', label: 'Disfraces y calabazas', glyphs: '🎃👻🧛' },
        { id: 'brillo', label: 'Corazones y brillos', glyphs: '💖✨💋' },
        { id: 'glam', label: 'Labios, tacones y copas', glyphs: '💄👠🥂' },
        { id: 'telaranas', label: 'Telarañas y murciélagos', glyphs: '🕸️🦇🕷️' },
        { id: 'mascaras', label: 'Máscaras y conejitas', glyphs: '🎭🐰😈' },
        { id: 'ninguno', label: 'Sin stickers', glyphs: '🚫', exclusive: true },
      ],
    },
    {
      id: 'cupo',
      title: '¿Cuántas fotos puede sacar cada invitado?',
      help: 'La gracia es elegir bien qué sacar y cuándo.',
      selection: 'single',
      visual: 'roll',
      options: [
        { id: '3', label: '3 fotos' },
        { id: '5', label: '5 fotos' },
        { id: '8', label: '8 fotos' },
        { id: '12', label: '12 fotos' },
        { id: 'no-se', label: 'No sé, recomiéndame' },
      ],
    },
    {
      id: 'evitar',
      title: '¿Qué NO quieres que se vea?',
      selection: 'single',
      options: [],
      notePlaceholder: 'Cosas que te dan lata, colores, estilos...',
    },
    {
      id: 'referencias',
      title: '¿Tienes referencias?',
      help: 'Links, películas, cuentas de Instagram, fotos.',
      selection: 'single',
      options: [],
      notePlaceholder: 'Pega aquí lo que tengas.',
    },
  ],
};

export default francisca;
