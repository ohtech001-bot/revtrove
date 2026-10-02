export const defaultCategories = [
  {id:'wheel',name_ar:'مجسمات الجنوط',name_en:'Wheel models',name_he:'דגמי גלגלים'},
  {id:'turbo',name_ar:'مجسمات التيربو',name_en:'Turbo models',name_he:'דגמי טורבו'},
  {id:'shelves',name_ar:'الرفوف',name_en:'Shelves',name_he:'מדפים'},
  {id:'keychains',name_ar:'علاقات المفاتيح',name_en:'Keychains',name_he:'מחזיקי מפתחות'},
]
export const categoryId = value => value === 'wheels' ? 'wheel' : value || 'wheel'
