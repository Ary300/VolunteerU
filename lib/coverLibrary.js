/* ==========================================================================
   coverLibrary.js, the cover photos a lead can pick from

   Every photo is from Pexels (free to use, no attribution required) and is
   listed with its photo page in /public/photos/CREDITS.md. Files live at
   /public/photos/covers/<key>.jpg (1600px wide) and /sm/<key>.jpg (480px).
   lib/photos.js turns each entry into a PHOTOS item.

   `set` is the cause the photo was chosen for ('general' covers disaster
   relief and Other). `alsoFits` lists other cause keys the subject plausibly
   shows. `pos` is the object-position that keeps the subject in a 4:3 crop.
   ========================================================================== */

/** Picker group names, in the order "Show all" lists them. */
export const COVER_SET_LABELS = {
  food: 'Food and hunger',
  education: 'Education',
  environment: 'Environment',
  animals: 'Animals',
  homelessness: 'Homelessness',
  seniors: 'Seniors',
  health: 'Health',
  arts: 'Arts',
  civic: 'Civic',
  general: 'Community',
};

/** @type {Array<{ key: string, set: string, pexels: string, subject: string, pos: string, alsoFits?: string[] }>} */
export const COVER_LIBRARY = [
  { key: 'food-1', set: 'food', pexels: '33368317', subject: 'women cooking in community kitchen', pos: '60% center', alsoFits: ['homelessness', 'seniors'] },
  { key: 'food-2', set: 'food', pexels: '10579215', subject: 'volunteers serving plated hot meals', pos: 'center 40%', alsoFits: ['homelessness', 'other'] },
  { key: 'food-3', set: 'food', pexels: '33576787', subject: 'hands peeling onions for meal prep', pos: '45% center', alsoFits: ['homelessness'] },
  { key: 'food-4', set: 'food', pexels: '35307939', subject: 'men ladling community meal outdoors', pos: '35% center', alsoFits: ['homelessness', 'disaster'] },
  { key: 'education-1', set: 'education', pexels: '3769981', subject: 'teen tutoring younger boy', pos: '40% center', alsoFits: ['other'] },
  { key: 'education-2', set: 'education', pexels: '8342284', subject: 'boy reading in library with mentor', pos: '45% center', alsoFits: ['civic'] },
  { key: 'education-3', set: 'education', pexels: '5538355', subject: 'peer tutoring at outdoor table', pos: 'center 40%', alsoFits: ['other'] },
  { key: 'education-4', set: 'education', pexels: '10638213', subject: 'kids reading in school library', pos: 'center 60%', alsoFits: ['civic'] },
  { key: 'environment-1', set: 'environment', pexels: '9034660', subject: 'family collecting trash at waterside', pos: 'center 40%', alsoFits: ['other'] },
  { key: 'environment-2', set: 'environment', pexels: '7656717', subject: 'two people planting trees by lake', pos: 'center center', alsoFits: ['other'] },
  { key: 'environment-3', set: 'environment', pexels: '36713475', subject: 'gloved hands picking up forest litter', pos: '60% center', alsoFits: ['civic', 'other'] },
  { key: 'environment-4', set: 'environment', pexels: '33352121', subject: 'women tending community garden plants', pos: 'center 30%', alsoFits: ['food'] },
  { key: 'animals-1', set: 'animals', pexels: '30577796', subject: 'rescue kittens held at clinic', pos: '55% center', alsoFits: ['health'] },
  { key: 'animals-2', set: 'animals', pexels: '20102427', subject: 'young man cradling a cat', pos: 'center 35%', alsoFits: ['other'] },
  { key: 'animals-3', set: 'animals', pexels: '35231855', subject: 'volunteer feeding dogs at sanctuary', pos: 'center center', alsoFits: ['disaster'] },
  { key: 'animals-4', set: 'animals', pexels: '7210536', subject: 'woman walking several dogs outdoors', pos: '50% 60%', alsoFits: ['other'] },
  { key: 'homelessness-1', set: 'homelessness', pexels: '9532260', subject: 'handing a meal to man outdoors', pos: 'center 35%', alsoFits: ['food'] },
  { key: 'homelessness-2', set: 'homelessness', pexels: '40091038', subject: 'women sorting donated clothes', pos: 'center 40%', alsoFits: ['disaster', 'other'] },
  { key: 'homelessness-3', set: 'homelessness', pexels: '36198667', subject: 'winter coats hung on fence', pos: 'center center', alsoFits: ['disaster', 'civic'] },
  { key: 'homelessness-4', set: 'homelessness', pexels: '29321559', subject: 'ladling hot soup into bowl', pos: '60% center', alsoFits: ['food', 'disaster'] },
  { key: 'seniors-1', set: 'seniors', pexels: '5585289', subject: 'teen and older woman sharing tea', pos: 'center 35%', alsoFits: ['other'] },
  { key: 'seniors-2', set: 'seniors', pexels: '7551606', subject: 'young man reading with older man', pos: '60% center', alsoFits: ['education'] },
  { key: 'seniors-3', set: 'seniors', pexels: '3823542', subject: 'young woman helping senior with phone', pos: '55% 40%', alsoFits: ['education'] },
  { key: 'seniors-4', set: 'seniors', pexels: '8064907', subject: 'teen baking with older woman', pos: 'center 30%', alsoFits: ['food'] },
  { key: 'health-1', set: 'health', pexels: '33034061', subject: 'blood pressure check at health fair', pos: 'center center', alsoFits: ['seniors'] },
  { key: 'health-2', set: 'health', pexels: '40040504', subject: 'student volunteer at medical camp', pos: 'center 30%', alsoFits: ['other'] },
  { key: 'health-3', set: 'health', pexels: '7446759', subject: 'young man checking senior\'s blood pressure', pos: 'center 40%', alsoFits: ['seniors'] },
  { key: 'health-4', set: 'health', pexels: '33317471', subject: 'CPR training on mannequins', pos: '55% center', alsoFits: ['education'] },
  { key: 'arts-1', set: 'arts', pexels: '36774842', subject: 'young artist painting outdoor mural', pos: 'center 40%', alsoFits: ['civic', 'food'] },
  { key: 'arts-2', set: 'arts', pexels: '8382313', subject: 'teens painting at easels in class', pos: '40% center', alsoFits: ['education'] },
  { key: 'arts-3', set: 'arts', pexels: '8190785', subject: 'guitar lesson with young boy', pos: '50% 40%', alsoFits: ['education'] },
  { key: 'arts-4', set: 'arts', pexels: '37046927', subject: 'young woman painting ground mural', pos: 'center 30%', alsoFits: ['civic'] },
  { key: 'civic-1', set: 'civic', pexels: '34519967', subject: 'neighbors in circle discussion', pos: 'center 50%', alsoFits: ['other'] },
  { key: 'civic-2', set: 'civic', pexels: '27471164', subject: 'community meeting under a tree', pos: 'center 60%', alsoFits: ['other'] },
  { key: 'civic-3', set: 'civic', pexels: '11599620', subject: 'librarian shelving books in library', pos: '30% center', alsoFits: ['education'] },
  { key: 'civic-4', set: 'civic', pexels: '35926011', subject: 'volunteers cleaning up a playground', pos: 'center center', alsoFits: ['environment', 'disaster'] },
  { key: 'general-1', set: 'general', pexels: '15682913', subject: 'group working in greenhouse rows', pos: 'center 55%', alsoFits: ['environment', 'food', 'other'] },
  { key: 'general-2', set: 'general', pexels: '28447797', subject: 'crew filling flood sandbags', pos: 'center 40%', alsoFits: ['disaster'] },
  { key: 'general-3', set: 'general', pexels: '14000747', subject: 'man hauling roofing after landslide', pos: '65% center', alsoFits: ['disaster'] },
  { key: 'general-4', set: 'general', pexels: '33222182', subject: 'neighbors hauling out a couch', pos: '60% center', alsoFits: ['disaster', 'civic'] },
];
