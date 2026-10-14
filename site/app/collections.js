/*
  Collections d'êtres vivants.

  Pour ajouter une collection, copier un bloc { id, nom, attributs, etres } :
  - attributs : les caractères proposés dans le menu des boîtes.
      id      identifiant court, sans espace ni accent
      nom     texte affiché (c'est aussi ce que l'élève peut taper au clavier)
      couleur facultative ; sinon une couleur est attribuée automatiquement
  - etres : les êtres vivants à classer.
      emoji   ou image: "images/fichier.png" (chemin relatif à index.html)
      attributs  liste des id d'attributs que possède l'être vivant

  La vérification compare simplement ces listes : une boîte « plumes » doit
  contenir tous les êtres vivants qui ont l'attribut plumes, et seulement eux.
*/
window.COLLECTIONS = [
  {
    id: 'jardin',
    nom: 'Sortie au jardin et à la mare',
    attributs: [
      { id: 'bouche', nom: 'bouche' },
      { id: 'yeux', nom: 'yeux' },
      { id: 'squelette_interne', nom: 'squelette interne' },
      { id: 'quatre_membres', nom: '4 membres' },
      { id: 'poils', nom: 'poils' },
      { id: 'plumes', nom: 'plumes' },
      { id: 'nageoires', nom: 'nageoires rayonnées' },
      { id: 'squelette_externe', nom: 'squelette externe' },
      { id: 'antennes', nom: 'antennes' },
      { id: 'six_pattes', nom: '6 pattes' },
      { id: 'huit_pattes', nom: '8 pattes' },
      { id: 'dix_pattes', nom: '10 pattes' },
      { id: 'coquille', nom: 'coquille' },
    ],
    etres: [
      { id: 'lapin', nom: 'Lapin', emoji: '🐇', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres', 'poils'] },
      { id: 'herisson', nom: 'Hérisson', emoji: '🦔', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres', 'poils'] },
      { id: 'chauve_souris', nom: 'Chauve-souris', emoji: '🦇', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres', 'poils'] },
      { id: 'merle', nom: 'Merle', emoji: '🐦', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres', 'plumes'] },
      { id: 'lezard', nom: 'Lézard', emoji: '🦎', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres'] },
      { id: 'grenouille', nom: 'Grenouille', emoji: '🐸', attributs: ['bouche', 'yeux', 'squelette_interne', 'quatre_membres'] },
      { id: 'epinoche', nom: 'Épinoche', emoji: '🐟', attributs: ['bouche', 'yeux', 'squelette_interne', 'nageoires'] },
      { id: 'escargot', nom: 'Escargot', emoji: '🐌', attributs: ['bouche', 'yeux', 'coquille'] },
      { id: 'araignee', nom: 'Araignée', emoji: '🕷️', attributs: ['bouche', 'yeux', 'squelette_externe', 'huit_pattes'] },
      { id: 'fourmi', nom: 'Fourmi', emoji: '🐜', attributs: ['bouche', 'yeux', 'squelette_externe', 'antennes', 'six_pattes'] },
      { id: 'coccinelle', nom: 'Coccinelle', emoji: '🐞', attributs: ['bouche', 'yeux', 'squelette_externe', 'antennes', 'six_pattes'] },
      { id: 'ecrevisse', nom: 'Écrevisse', emoji: '🦞', attributs: ['bouche', 'yeux', 'squelette_externe', 'antennes', 'dix_pattes'] },
      { id: 'lombric', nom: 'Lombric', emoji: '🪱', attributs: ['bouche'] },
    ],
  },
  {
    id: 'vertebres',
    nom: 'Les vertébrés',
    attributs: [
      { id: 'squelette_interne', nom: 'squelette interne' },
      { id: 'nageoires', nom: 'nageoires rayonnées' },
      { id: 'quatre_membres', nom: '4 membres' },
      { id: 'carapace', nom: 'carapace' },
      { id: 'plumes', nom: 'plumes' },
      { id: 'poils', nom: 'poils' },
      { id: 'mamelles', nom: 'mamelles' },
    ],
    etres: [
      { id: 'requin', nom: 'Requin', emoji: '🦈', attributs: ['squelette_interne'] },
      { id: 'truite', nom: 'Truite', emoji: '🐟', attributs: ['squelette_interne', 'nageoires'] },
      { id: 'grenouille', nom: 'Grenouille', emoji: '🐸', attributs: ['squelette_interne', 'quatre_membres'] },
      { id: 'tortue', nom: 'Tortue', emoji: '🐢', attributs: ['squelette_interne', 'quatre_membres', 'carapace'] },
      { id: 'crocodile', nom: 'Crocodile', emoji: '🐊', attributs: ['squelette_interne', 'quatre_membres'] },
      { id: 'pigeon', nom: 'Pigeon', emoji: '🕊️', attributs: ['squelette_interne', 'quatre_membres', 'plumes'] },
      { id: 'aigle', nom: 'Aigle', emoji: '🦅', attributs: ['squelette_interne', 'quatre_membres', 'plumes'] },
      { id: 'chat', nom: 'Chat', emoji: '🐈', attributs: ['squelette_interne', 'quatre_membres', 'poils', 'mamelles'] },
      { id: 'souris', nom: 'Souris', emoji: '🐁', attributs: ['squelette_interne', 'quatre_membres', 'poils', 'mamelles'] },
      { id: 'chauve_souris', nom: 'Chauve-souris', emoji: '🦇', attributs: ['squelette_interne', 'quatre_membres', 'poils', 'mamelles'] },
    ],
  },
  {
    id: 'plantes',
    nom: 'Les plantes',
    attributs: [
      { id: 'chlorophylle', nom: 'chlorophylle' },
      { id: 'tiges_feuilles', nom: 'tiges et feuilles' },
      { id: 'vaisseaux', nom: 'vaisseaux conducteurs' },
      { id: 'graines', nom: 'graines' },
      { id: 'cones', nom: 'cônes' },
      { id: 'fleurs', nom: 'fleurs' },
      { id: 'fruits', nom: 'fruits' },
      { id: 'nervures_paralleles', nom: 'feuilles à nervures parallèles' },
    ],
    etres: [
      { id: 'ulve', nom: 'Ulve (algue)', emoji: '🥬', attributs: ['chlorophylle'] },
      { id: 'mousse', nom: 'Mousse', emoji: '🌱', attributs: ['chlorophylle', 'tiges_feuilles'] },
      { id: 'fougere', nom: 'Fougère', emoji: '🌿', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux'] },
      { id: 'prele', nom: 'Prêle', emoji: '🎋', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux'] },
      { id: 'pin', nom: 'Pin', emoji: '🌲', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'cones'] },
      { id: 'sapin', nom: 'Sapin', emoji: '🎄', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'cones'] },
      { id: 'chene', nom: 'Chêne', emoji: '🌳', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits'] },
      { id: 'pommier', nom: 'Pommier', emoji: '🍎', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits'] },
      { id: 'rosier', nom: 'Rosier', emoji: '🌹', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits'] },
      { id: 'tournesol', nom: 'Tournesol', emoji: '🌻', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits'] },
      { id: 'tulipe', nom: 'Tulipe', emoji: '🌷', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits', 'nervures_paralleles'] },
      { id: 'ble', nom: 'Blé', emoji: '🌾', attributs: ['chlorophylle', 'tiges_feuilles', 'vaisseaux', 'graines', 'fleurs', 'fruits', 'nervures_paralleles'] },
    ],
  },
  {
    id: 'marins',
    nom: 'Les animaux marins',
    attributs: [
      { id: 'bouche', nom: 'bouche' },
      { id: 'squelette_interne', nom: 'squelette interne' },
      { id: 'nageoires', nom: 'nageoires rayonnées' },
      { id: 'poumons', nom: 'poumons' },
      { id: 'mamelles', nom: 'mamelles' },
      { id: 'carapace', nom: 'carapace' },
      { id: 'corps_mou', nom: 'corps mou' },
      { id: 'ventouses', nom: 'bras à ventouses' },
      { id: 'coquille', nom: 'coquille' },
      { id: 'squelette_externe', nom: 'squelette externe' },
      { id: 'dix_pattes', nom: '10 pattes' },
    ],
    etres: [
      { id: 'requin', nom: 'Requin', emoji: '🦈', attributs: ['bouche', 'squelette_interne'] },
      { id: 'thon', nom: 'Thon', emoji: '🐟', attributs: ['bouche', 'squelette_interne', 'nageoires'] },
      { id: 'poisson_clown', nom: 'Poisson-clown', emoji: '🐠', attributs: ['bouche', 'squelette_interne', 'nageoires'] },
      { id: 'tortue_mer', nom: 'Tortue de mer', emoji: '🐢', attributs: ['bouche', 'squelette_interne', 'poumons', 'carapace'] },
      { id: 'dauphin', nom: 'Dauphin', emoji: '🐬', attributs: ['bouche', 'squelette_interne', 'poumons', 'mamelles'] },
      { id: 'baleine', nom: 'Baleine', emoji: '🐋', attributs: ['bouche', 'squelette_interne', 'poumons', 'mamelles'] },
      { id: 'phoque', nom: 'Phoque', emoji: '🦭', attributs: ['bouche', 'squelette_interne', 'poumons', 'mamelles'] },
      { id: 'pieuvre', nom: 'Pieuvre', emoji: '🐙', attributs: ['bouche', 'corps_mou', 'ventouses'] },
      { id: 'calmar', nom: 'Calmar', emoji: '🦑', attributs: ['bouche', 'corps_mou', 'ventouses'] },
      { id: 'huitre', nom: 'Huître', emoji: '🦪', attributs: ['bouche', 'corps_mou', 'coquille'] },
      { id: 'crabe', nom: 'Crabe', emoji: '🦀', attributs: ['bouche', 'squelette_externe', 'dix_pattes'] },
      { id: 'crevette', nom: 'Crevette', emoji: '🦐', attributs: ['bouche', 'squelette_externe', 'dix_pattes'] },
    ],
  },
];
