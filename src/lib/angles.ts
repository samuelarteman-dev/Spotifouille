/**
 * Les angles de fouille.
 *
 * Sans contrainte, un modèle de langage converge toujours vers les mêmes
 * réponses canoniques. L'angle est tiré au sort à chaque requête et injecté
 * comme obligation, ce qui force une attaque du catalogue par un autre bord.
 */

export interface Angle {
  cle: string
  libelle: string
  consigne: string
}

export const ANGLES: Angle[] = [
  {
    cle: 'producteur',
    libelle: 'par le producteur ou l’ingénieur du son',
    consigne:
      "Pars d'un producteur ou d'un ingénieur du son précis. Nomme-le, dis ce qu'il fait au son, et sors des morceaux de son catalogue.",
  },
  {
    cle: 'label',
    libelle: 'par le label et son catalogue',
    consigne:
      "Pars d'un label précis et de sa ligne éditoriale. Nomme-le, situe sa période, et pioche dans son catalogue.",
  },
  {
    cle: 'annee',
    libelle: 'par une année précise et son contexte',
    consigne:
      "Choisis une année précise, dis ce qui se passait musicalement cette année-là, et sors des morceaux qui en viennent.",
  },
  {
    cle: 'ville',
    libelle: 'par une ville ou une scène géographique',
    consigne:
      "Pars d'une ville ou d'une scène locale. Nomme les lieux, les clubs, les studios, et sors des morceaux issus de ce terrain.",
  },
  {
    cle: 'samples',
    libelle: 'par une lignée de samples, en amont ou en aval',
    consigne:
      "Suis une lignée de samples : soit la source qu'un morceau a pillée, soit ce qui a pillé un morceau. Explique la filiation.",
  },
  {
    cle: 'session',
    libelle: 'par les musiciens de session',
    consigne:
      "Pars d'un musicien de session, d'un batteur, d'un bassiste, d'un groupe de studio. Suis-le de disque en disque.",
  },
  {
    cle: 'reprise',
    libelle: 'par une reprise, une version alternative, un remix',
    consigne:
      "Cherche des reprises, versions alternatives, remixes, réenregistrements. Dis ce que la version change par rapport à l'originale.",
  },
  {
    cle: 'faceb',
    libelle: 'par une face B ou un morceau d’album jamais sorti en single',
    consigne:
      "Ne propose aucun single. Uniquement des faces B, des morceaux d'album, des inédits de rééditions.",
  },
  {
    cle: 'bo',
    libelle: 'par une bande originale de film ou de jeu',
    consigne:
      "Pars d'une bande originale de film, de série ou de jeu. Situe la scène ou le moment auquel le morceau appartient.",
  },
  {
    cle: 'texture',
    libelle: 'par un instrument ou une texture sonore particulière',
    consigne:
      "Pars d'un instrument ou d'une texture précise : un synthé, une boîte à rythmes, un type de réverbération, une façon d'enregistrer. Dis où l'entendre.",
  },
  {
    cle: 'contrepied',
    libelle: 'par le contre-pied assumé de mes habitudes',
    consigne:
      "Prends le contre-pied de l'empreinte. Va vers ce qui n'y figure pas du tout et assume-le, mais garde un fil qui relie au goût existant.",
  },
]

/** Tirage uniforme. On évite l'angle précédent pour ne pas se répéter. */
export function tirerAngle(precedent?: string): Angle {
  const pool = ANGLES.filter((a) => a.cle !== precedent)
  const source = pool.length ? pool : ANGLES
  const index = Math.floor(Math.random() * source.length)
  return source[index] ?? ANGLES[0]!
}

export function angleParCle(cle: string | undefined): Angle | undefined {
  return ANGLES.find((a) => a.cle === cle)
}
