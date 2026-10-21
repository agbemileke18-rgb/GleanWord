import { normalizeYorubaText } from '../utils/normalizeYoruba.js';

export async function saveCorpusText(supabaseClient, { title, author, content, category, metadata }) {
    const cleanTitle = normalizeYorubaText(title);
    const cleanAuthor = normalizeYorubaText(author);
    const cleanContent = normalizeYorubaText(content);

    const { data, error } = await supabaseClient
        .from('corpus_texts')
        .insert([
            {
                title: cleanTitle,
                author: cleanAuthor,
                content: cleanContent,
                category: category || 'grammar', // Ensures category is saved
                metadata: metadata,
                language_code: 'yo'
            }
        ])
        .select();

    if (error) {
        console.error('Supabase insertion error:', error.message);
        throw new Error(error.message);
    }

    return data[0];
}