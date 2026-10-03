// One-time import templates only. Never imported by the client or runtime API.
import {catalogAdditions,bmwAdditionalImages,addedTextDefaults} from '../../shared/catalog-additions.mjs'
const legacyProducts = [
  { id:1, slug:'bmw-m3-cs', name_ar:'BMW M3 CS Wheel', name_en:'BMW M3 CS Wheel', name_he:'גלגל BMW M3 CS', description_ar:'مجسم فاخر مطبوع ثلاثي الأبعاد ومصقول يدويًا.', description_en:'A premium 3D-printed, hand-finished automotive model.', description_he:'דגם רכב איכותי בהדפסת תלת־ממד ובגימור ידני.', price:129, images:['/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg','/assets/bmw/d6c6e38b-861a-40d3-815e-9b502b4a362e.jpg','/assets/bmw/4f12cebe-f72c-4b4a-a233-e016a48942a6.jpg','/assets/bmw/b5f83159-03c7-411a-b6e4-0ca04a047432.jpg','/assets/bmw/e5b305cf-13c6-43e9-83f2-6ce19e234016.jpg'], model_parts:{ rim:'/models/bmw-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb', hub:'/models/hub-cs.glb' }, customizable_parts:['rim','disc','caliper','stand','hub'] },
  { id:2, slug:'dodge-srt', name_ar:'Dodge SRT Wheel', name_en:'Dodge SRT Wheel', name_he:'גלגל Dodge SRT', description_ar:'مجسم SRT رياضي بتفاصيل دقيقة.', description_en:'A detailed SRT display wheel with a bold stance.', description_he:'דגם SRT ספורטיבי עם פרטים מדויקים.', price:119, images:['/assets/srt/76f7ea82-6eac-451c-9653-f3f16a770a6f.jpg','/assets/srt/e78f7d63-e0ec-49b2-bd87-ba743b461927.jpg','/assets/srt/bbde8eee-44a1-49d2-bcdc-faece5d70e44.jpg'], model_parts:{ rim:'/models/srt-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb' }, customizable_parts:['rim','disc','caliper','stand'] },
  { id:3, slug:'porsche-gt3rs', name_ar:'Porsche GT3 RS Wheel', name_en:'Porsche GT3 RS Wheel', name_he:'גלגל Porsche GT3 RS', description_ar:'قطعة مستوحاة من GT3 RS لعشاق بورشه.', description_en:'A GT3 RS-inspired collectible for Porsche enthusiasts.', description_he:'פריט בהשראת GT3 RS לאוהבי פורשה.', price:139, images:['/assets/porsche/24d3d0f8-fbef-474a-9fbb-845b245b9690.jpg','/assets/porsche/47cad8b1-7da3-4d9b-b133-9f581f9707bd.jpg','/assets/porsche/3657b30e-edc1-4ceb-845e-71099d41dcdd.jpg','/assets/porsche/e059cf1a-b77c-4dc3-9624-e78871b2b782.jpg'], model_parts:{ rim:'/models/bmw-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb' }, customizable_parts:['rim','disc','caliper','stand'] },
]

legacyProducts.push({
  id:4, slug:'bmw-m-turbo', category:'turbo',
  name_ar:'مجسم تيربو BMW M', name_en:'BMW M Turbo Display', name_he:'דגם טורבו BMW M',
  description_ar:'مجسم تيربو مطبوع ثلاثي الأبعاد بتفاصيل دقيقة وفلتر ملوّن، قطعة عرض مميزة لعشاق السيارات.',
  description_en:'A detailed 3D-printed turbo display with a colored filter, made for automotive enthusiasts.',
  description_he:'דגם טורבו מודפס בתלת־ממד עם פרטים מדויקים ופילטר צבעוני לחובבי רכב.',
  price:149,
  images:['/assets/turbo/turbo-5.jpg','/assets/turbo/turbo-1.jpg','/assets/turbo/turbo-2.jpg','/assets/turbo/turbo-3.jpg','/assets/turbo/turbo-4.jpg'],
  model_parts:{}, customizable_parts:['airFilter','turboBody','fan','stand']
})

legacyProducts[0].images.push(...bmwAdditionalImages)
legacyProducts.push(...catalogAdditions)

export {legacyProducts}
export const legacyDefaultText = {
  ...addedTextDefaults,
  'bmw-m3-cs':{ base:'BMW M3 CS',caliper:'BREMBO' },
  'dodge-srt':{ base:'SRT',caliper:'BREMBO' },
  'porsche-gt3rs':{ base:'PORSCHE GT3 RS',caliper:'PORSCHE' },
  'bmw-m-turbo':{ base:'BMW M',caliper:'' },
}
