import { normalizeYorubaText } from '../utils/normalizeYoruba.js';

export async function saveCorpusText(supabaseClient, {
    title, author, content, category, metadata, description = '', cover_url = '', access_type = 'free', price = 0, author_subaccount_code = '', status = 'pending', language_code = 'yo'
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
            author_subaccount_code: author_subaccount_code,
            status: status,
            language_code: language_code || 'yo',
            metadata: metadata,
            is_featured: false
        }])
        .select();

    if (workError) {
        console.error('Supabase insertion error:', workError.message);
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
        console.error('Chapter creation error:', chapterError.message);
        throw new Error(chapterError.message);
    }

    console.log('Successfully saved work with full metadata and generated chapter 1:', newWork);
    return newWork;
}