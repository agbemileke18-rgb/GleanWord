import { normalizeYorubaText } from '../utils/normalizeYoruba.js';

export async function saveCorpusText(supabaseClient, {
    title,
    author,
    content,
    category,
    metadata,
    description = '',
    cover_url = '',
    access_type = '',
    price = 0,
    status = 'pending',
    language_code = 'yo',
    is_featured = false,
    author_id = null 
}) {
    const cleanTitle = normalizeYorubaText(title);
    const cleanAuthor = normalizeYorubaText(author);
    const cleanContent = normalizeYorubaText(content);
    const cleanDescription = normalizeYorubaText(description);

    const slug = cleanTitle
        .toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-');

    const { data: workData, error: workError } = await supabaseClient
        .from('works')
        .insert([{
            title: cleanTitle,
            slug: slug,
            author: cleanAuthor,
            category: category || 'grammar',
            description: cleanDescription,
            cover_url: cover_url,
            access_type: access_type,
            price: price,
            status: status,
            language_code: language_code || 'yo',
            metadata: metadata,
            is_featured: is_featured,
            author_id: author_id 
        }])
        .select();

    if (workError) {
        console.error('Supabase Insertion error:', workError.message);
        throw new Error(workError.message);
    }

    const newWork = workData[0];

    const { error: chapterError } = await supabaseClient
        .from('chapters')
        .insert([{
            work_id: newWork.id,
            chapter_number: 1,
            title: cleanTitle,
            content: cleanContent
        }]);

    if (chapterError) {
        console.error('Chapter insertion error:', chapterError.message);
        throw new Error(chapterError.message);
    }

    return newWork;
}