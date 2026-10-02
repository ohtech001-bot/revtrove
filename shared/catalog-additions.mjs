const wheel = (slug, name, hebrew, count, defaults) => ({
  slug, category:'wheel', name_ar:name, name_en:name, name_he:hebrew,
  description_ar:'مجسم عجل مطبوع ثلاثي الأبعاد، قابل لتخصيص الألوان والنص.',
  description_en:'A 3D-printed display wheel with customizable colors and text.',
  description_he:'גלגל תצוגה מודפס בתלת־ממד עם צבעים וטקסט בהתאמה אישית.',
  price:null, images:Array.from({length:count},(_,i)=>`/assets/${slug}/${i+1}.jpg`),
  model_parts:{}, customizable_parts:['rim','disc','caliper','stand'], defaults,
})
export const catalogAdditions = [
  wheel('audi-rs3-black','Audi RS3 Black Wheel','גלגל Audi RS3 שחור',4,{base:'AUDI RS3',caliper:'RS'}),
  wheel('audi-rs3-mesh','Audi RS3 Mesh Wheel','גלגל Audi RS3 רשת',3,{base:'AUDI RS3',caliper:'RS'}),
  wheel('ferrari-wheel','Ferrari Wheel','גלגל Ferrari',1,{base:'Ferrari',caliper:'Ferrari'}),
  wheel('seat-cupra','SEAT CUPRA Wheel','גלגל SEAT CUPRA',3,{base:'CUPRA',caliper:'CUPRA'}),
]
export const bmwAdditionalImages = [1,2,3,4].map(i=>`/assets/bmw/new-${i}.jpg`)
export const addedTextDefaults = Object.fromEntries(catalogAdditions.map(p=>[p.slug,p.defaults]))
export function formatProductPrice(price, language='ar') {
  if (price == null || price === '' || !Number.isFinite(Number(price))) {
    return ({ar:'السعر عند التأكيد',en:'Price on request',he:'מחיר בתיאום'})[language] || 'Price on request'
  }
  return `₪${Number(price).toFixed(0)}`
}
