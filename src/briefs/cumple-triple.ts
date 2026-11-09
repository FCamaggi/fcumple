import type { BriefDefinition } from './types';

// Brief para un cumpleaños compartido por tres personas. Cada una responde por
// separado con su nombre (cada envío queda como una fila con su `respondent`),
// así que las preguntas se redactan en singular y el diseño final se arma
// cruzando las tres respuestas. Además del marco de los tres, cada persona
// puede pedir un marco propio.
const cumpleTriple: BriefDefinition = {
  slug: 'cumple-triple',
  title: 'Tres cumpleaños, una fiesta',
  intro:
    'Cada uno de los tres responde por separado: escribe tu nombre arriba y elige lo que más te guste. Si no coinciden, armamos la cámara con lo que se repita y lo conversamos. Lo que elijas primero (colores, letras y textos) se aplica en las vistas previas de las preguntas siguientes. Siempre puedes escribir lo que quieras en la nota.',
  questions: [
    {
      id: 'paleta',
      title: '¿Qué paleta de colores prefieres?',
      help: 'Se aplica en toda la cámara y en los marcos.',
      selection: 'single',
      visual: 'palette',
      options: [
        {
          id: 'neon',
          label: 'Neón de fiesta',
          hint: 'Fucsia y celeste sobre negro.',
          palette: { bg: '#0b0a14', accent: '#ff3ea5', soft: '#2de2e6', text: '#f5f3ff' },
        },
        {
          id: 'dorado',
          label: 'Negro y dorado',
          hint: 'Glam y elegante.',
          palette: { bg: '#0e0c0b', accent: '#d4af37', soft: '#6b5626', text: '#f6f0e1' },
        },
        {
          id: 'pastel',
          label: 'Pastel de noche',
          hint: 'Lila y durazno.',
          palette: { bg: '#16141d', accent: '#c9b6ff', soft: '#f6b8a0', text: '#fdf7ff' },
        },
        {
          id: 'plata',
          label: 'Azul noche y plata',
          palette: { bg: '#0b1020', accent: '#c7d0e0', soft: '#2b3f73', text: '#eef2fa' },
        },
        {
          id: 'tropical',
          label: 'Coral y verde',
          hint: 'Tropical y alegre.',
          palette: { bg: '#0d1a17', accent: '#ff7a59', soft: '#1f6f5c', text: '#fff4ea' },
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
        { id: 'firma', label: 'Manuscrita', hint: 'Cursiva, como firma.', font: 'hand' },
        { id: 'maquina', label: 'Máquina de escribir', font: 'typewriter' },
        { id: 'moderna', label: 'Moderna', font: 'sans' },
      ],
    },
    {
      id: 'textos',
      title: '¿Qué dicen los marcos?',
      help: 'Escribe los nombres de los tres como quieren que aparezcan. Se ven en las vistas previas.',
      selection: 'single',
      options: [],
      fields: [
        { id: 'nombre', label: 'Nombres de los tres', placeholder: 'Ej: Ana, Bea y Caro' },
        { id: 'fiesta', label: 'Nombre de la fiesta (opcional)', placeholder: 'Ej: Triple cumple' },
        { id: 'fecha', label: 'Fecha', placeholder: 'Ej: 22 de noviembre' },
        { id: 'edades', label: 'Edades que cumplen (opcional)', placeholder: 'Déjalo vacío si no quieren que salgan' },
        { id: 'frase', label: 'Frase o hashtag (opcional)', placeholder: 'Lo que quieras que lleve' },
      ],
    },
    {
      id: 'ambiente',
      title: '¿Qué ambiente tiene la fiesta?',
      help: 'Elige hasta dos.',
      selection: 'multi',
      max: 2,
      options: [
        { id: 'disco', label: 'Disco', hint: 'Bola de espejos, brillos y baile.' },
        { id: 'club', label: 'Club de noche', hint: 'Oscuro y elegante.' },
        { id: 'elegante', label: 'Elegante', hint: 'Más formal, para brindar.' },
        { id: 'tropical', label: 'Tropical', hint: 'Colores, flores y verano.' },
        { id: 'retro', label: 'Retro', hint: 'Años 80 o 90.' },
        { id: 'relajado', label: 'Junta relajada', hint: 'Asado o algo tranquilo con amigos.' },
      ],
      notePlaceholder: 'Si hay disfraz, temática o código de vestimenta, cuéntanos...',
    },
    {
      id: 'marco-comun',
      title: '¿Qué estilo te gusta para el marco de los tres?',
      help: 'Es el marco que comparten. Elige hasta dos; el diseño final se hace con lo que elijan los tres.',
      selection: 'multi',
      max: 2,
      options: [
        { id: 'trio', label: 'Uno por cumpleañero', hint: 'Tres velas o tres globos, cada uno con un nombre.' },
        { id: 'disco', label: 'Disco', hint: 'Bola de espejos y destellos.' },
        { id: 'polaroid', label: 'Foto instantánea', hint: 'Borde blanco con los nombres escritos abajo.' },
        { id: 'confeti', label: 'Confeti', hint: 'Confeti y serpentinas en los bordes.' },
        { id: 'neon', label: 'Letrero de neón', hint: 'Los nombres en luces de neón.' },
        { id: 'privado', label: 'Lo conversamos en privado', hint: 'No elijo ahora.', exclusive: true },
      ],
      notePlaceholder: 'Algo que hayas visto y te guste, o cómo lo imaginas...',
    },
    {
      id: 'marco-propio',
      title: '¿Quieres además un marco solo tuyo?',
      help: 'Un marco con tu nombre, que cualquier invitado puede usar.',
      selection: 'single',
      options: [
        { id: 'si', label: 'Sí, quiero uno con mi nombre' },
        { id: 'no', label: 'No, me basta con el de los tres' },
      ],
      notePlaceholder: 'Si dijiste que sí: cómo te lo imaginas (algo que te guste, un dibujo, un color)...',
    },
    {
      id: 'stickers',
      title: '¿Qué stickers sumamos a las fotos?',
      selection: 'multi',
      visual: 'emoji',
      options: [
        { id: 'fiesta', label: 'Fiesta y torta', glyphs: '🎉🎂🎈' },
        { id: 'brillo', label: 'Brillos y disco', glyphs: '✨🪩💖' },
        { id: 'brindis', label: 'Brindis', glyphs: '🥂🍾🍻' },
        { id: 'chistosos', label: 'Caras chistosas', glyphs: '😜🤪🙈' },
        { id: 'corona', label: 'Coronas y fuego', glyphs: '👑🔥💃' },
        { id: 'ninguno', label: 'Sin stickers', glyphs: '🚫', exclusive: true },
      ],
      notePlaceholder: 'Si tienen stickers propios (dibujos, memes, fotos recortadas), cuéntanos y los sumamos...',
    },
    {
      id: 'invitados',
      title: '¿Cuántos invitados esperan entre los tres?',
      help: 'Nos sirve para calcular cuántas fotos caben.',
      selection: 'single',
      options: [
        { id: 'hasta-30', label: 'Hasta 30' },
        { id: '30-60', label: 'Entre 30 y 60' },
        { id: '60-100', label: 'Entre 60 y 100' },
        { id: 'mas-100', label: 'Más de 100' },
        { id: 'no-se', label: 'No sé todavía' },
      ],
    },
    {
      id: 'cupo',
      title: '¿Cuántas fotos puede sacar cada invitado?',
      help: 'Como un rollo de cámara: cuando se acaba, se acaba.',
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
      id: 'acceso',
      title: '¿Cómo entran los invitados a la cámara?',
      selection: 'single',
      options: [
        { id: 'qr', label: 'Con un QR en la fiesta', hint: 'Escanean y sacan fotos, sin inscribirse antes.' },
        { id: 'enlace', label: 'Con un enlace antes de la fiesta', hint: 'Se inscriben con su nombre y la cámara se abre ese día.' },
        { id: 'no-se', label: 'No sé, recomiéndame' },
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

export default cumpleTriple;
