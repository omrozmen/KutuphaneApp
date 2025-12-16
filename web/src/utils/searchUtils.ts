/**
 * Türkçe karakterleri normalize eder ve büyük/küçük harf duyarsız arama için kullanılır
 * @param text - Normalize edilecek metin
 * @returns Normalize edilmiş metin (küçük harf, Türkçe karakterler normalize edilmiş)
 */
export const normalizeTurkishText = (text: string): string => {
  if (!text) return '';
  
  // Önce Türkçe karakterleri normalize et (büyük/küçük harf duyarsız)
  // Sonra toLowerCase yap
  return text
    // Türkçe karakterleri normalize et (hem büyük hem küçük)
    .replace(/ı/gi, 'i')
    .replace(/İ/gi, 'i')
    .replace(/ş/gi, 's')
    .replace(/Ş/gi, 's')
    .replace(/ğ/gi, 'g')
    .replace(/Ğ/gi, 'g')
    .replace(/ü/gi, 'u')
    .replace(/Ü/gi, 'u')
    .replace(/ö/gi, 'o')
    .replace(/Ö/gi, 'o')
    .replace(/ç/gi, 'c')
    .replace(/Ç/gi, 'c')
    // Sonra küçük harfe çevir
    .toLowerCase();
};

/**
 * Arama terimini normalize eder (kullanıcı girişi için)
 * @param searchTerm - Arama terimi
 * @returns Normalize edilmiş arama terimi
 */
export const normalizeSearchTerm = (searchTerm: string): string => {
  return normalizeTurkishText(searchTerm);
};

/**
 * Metin araması yapar - Türkçe karakter desteği ile
 * @param text - Aranacak metin
 * @param searchTerm - Arama terimi
 * @returns Eşleşme varsa true
 */
export const searchIncludes = (text: string | number | null | undefined, searchTerm: string): boolean => {
  if (text === undefined || text === null) return false;
  const normalizedText = normalizeTurkishText(text.toString());
  const normalizedSearch = normalizeSearchTerm(searchTerm);
  return normalizedText.includes(normalizedSearch);
};

