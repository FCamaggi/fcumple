import type { BriefDefinition } from './types';

// Borrador de opciones para el cumpleaños de disfraces de Francisca. Son
// propuestas para que ella elija; cada pregunta deja además una nota libre.
const francisca: BriefDefinition = {
  slug: 'francisca',
  title: 'Tu cumpleaños, tu estilo',
  intro:
    'Elige lo que más te guste en cada pregunta. Puedes marcar varias donde se indique y siempre puedes escribir lo que quieras en la nota. Nada es definitivo: es para armar tu cámara y tus marcos.',
  questions: [
    {
      id: 'ambiente',
      title: '¿Qué ambiente tiene que tener la fiesta?',
      help: 'Elige hasta dos.',
      selection: 'multi',
      options: [
        { id: 'meangirls', label: 'Carrete de disfraces con actitud', hint: 'Rosa, brillo y mucha pose.' },
        { id: 'club', label: 'Club de noche', hint: 'Oscuro, elegante y un poco peligroso.' },
        { id: 'gala', label: 'Gala de terror glam', hint: 'Terciopelo, rojo vino y encaje.' },
        { id: 'mascarada', label: 'Mascarada', hint: 'Máscaras, dorado y misterio.' },
        { id: 'retro', label: 'Cine de terror retro', hint: 'Sangre falsa, VHS y humor.' },
      ],
      notePlaceholder: 'Otra idea, una película, una escena...',
    },
    {
      id: 'paleta',
      title: '¿Qué paleta de colores te late?',
      selection: 'single',
      options: [
        { id: 'rosa-negro', label: 'Rosa chicle y negro', swatches: ['#ff5fa2', '#111111', '#f5e6ee'] },
        { id: 'vino-dorado', label: 'Rojo vino y dorado', swatches: ['#6d0f26', '#c9a24b', '#1a0b10'] },
        { id: 'ciruela-plata', label: 'Ciruela y plata', swatches: ['#4a1d5c', '#b9bcc7', '#14091a'] },
        { id: 'negro-hueso', label: 'Negro y blanco hueso', swatches: ['#0e0e0e', '#f2efe6', '#7a7a7a'] },
        { id: 'calabaza', label: 'Negro con un toque de naranja', swatches: ['#0e0e0e', '#ff7a1a', '#3a2a1a'] },
      ],
      notePlaceholder: 'Un color que no puede faltar o que no quieres...',
    },
    {
      id: 'titulos',
      title: '¿Cómo se ven las letras de los títulos?',
      selection: 'single',
      options: [
        { id: 'cartel', label: 'Gruesas, de cartel' },
        { id: 'serifa', label: 'Elegantes, con serifa' },
        { id: 'maquina', label: 'De máquina de escribir' },
        { id: 'firma', label: 'Cursivas, como firma' },
      ],
    },
    {
      id: 'marcos',
      title: '¿Qué estilo de marco para las fotos?',
      help: 'Elige los que te gusten.',
      selection: 'multi',
      options: [
        { id: 'polaroid', label: 'Polaroid con texto abajo' },
        { id: 'fotomaton', label: 'Tira de fotomatón' },
        { id: 'entrada', label: 'Entrada al evento', hint: 'Con nombre, fecha y lugar.' },
        { id: 'borde-fino', label: 'Borde fino con la fecha' },
        { id: 'esquinas', label: 'Esquinas decoradas' },
        { id: 'solo-texto', label: 'Sin marco, solo texto abajo' },
      ],
      notePlaceholder: 'Algo que hayas visto y te guste...',
    },
    {
      id: 'textos',
      title: '¿Qué dicen los marcos?',
      help: 'Frase, nombre, fecha, lugar o hashtag.',
      selection: 'single',
      options: [],
      notePlaceholder: 'Por ejemplo: "Cumple de Fran · 31 de octubre · #FranSeVuelveMala"',
    },
    {
      id: 'stickers',
      title: '¿Qué stickers quieres para sumar a las fotos?',
      selection: 'multi',
      options: [
        { id: 'disfraces', label: 'Disfraces y calabazas' },
        { id: 'brillo', label: 'Corazones y brillos' },
        { id: 'glam', label: 'Labios, tacones y copas' },
        { id: 'telaranas', label: 'Telarañas y murciélagos' },
        { id: 'mascaras', label: 'Máscaras' },
        { id: 'ninguno', label: 'Sin stickers' },
      ],
    },
    {
      id: 'cupo',
      title: '¿Cuántas fotos puede sacar cada invitado?',
      help: 'La gracia es elegir bien qué sacar y cuándo.',
      selection: 'single',
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
