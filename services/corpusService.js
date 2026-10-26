import { normalizeYorubaText } from '../utils/normalizeYoruba.js';

export async function saveCorpusText(supabaseClient, { 
    title, 
    author, 
    content, 
    category, 
    metadata, 
    description = '', 
    cover_url = '', 
    access_type = 'free', 
    price = 0, 
    author_subaccount_code = '', 
    status = 'pending' 
}) {
    const cleanTitle = normalizeYorubaText(title);
    const cleanAuthor = normalizeYorubaText(author);
    const cleanContent = normalizeYorubaText(content);
    const cleanDescription = normalizeYorubaText(description);

    const { data, error } = await supabaseClient
        .from('corpus_texts')
        .insert([
            {
                title: cleanTitle,
                author: cleanAuthor,
                content: cleanContent,
                category: category || 'grammar',
                metadata: metadata,
                language_code: 'yo',
                description: cleanDescription,
                cover_url: cover_url,
                access_type: access_type,
                price: price,
                author_subaccount_code: author_subaccount_code,
                status: status
            }
        ])
        .select();

    if (error) {
        console.error('Supabase insertion error:', error.message);
        throw new Error(error.message);
    }

    return data[0];
}