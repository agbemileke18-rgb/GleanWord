import { normalizeYorubaText } from '../utils/normalizeYoruba.js';

export const DUPLICATE_WORK_TITLE_MESSAGE =
    'This book title has already been used and cannot be duplicated. Please choose another book title or add a number or character to make it unique.';

export function getCorpusSlug(title) {
    return normalizeYorubaText(title)
        .toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-');
}

export async function ensureWorkTitleAvailable(supabaseClient, title, slug, excludeWorkId = null) {
    const escapedTitlePattern = String(title).replace(/[\\%_]/g, '\\$&');
    let slugQuery = supabaseClient
        .from('works')
        .select('id')
        .eq('slug', slug)
        .limit(1);
    let titleQuery = supabaseClient
        .from('works')
        .select('id')
        .ilike('title', escapedTitlePattern)
        .limit(1);

    if (excludeWorkId) {
        slugQuery = slugQuery.neq('id', excludeWorkId);
        titleQuery = titleQuery.neq('id', excludeWorkId);
    }

    const [{ data: slugMatches, error: slugError }, { data: titleMatches, error: titleError }] =
        await Promise.all([slugQuery, titleQuery]);
    if (slugError) throw slugError;
    if (titleError) throw titleError;
    if (slugMatches?.length || titleMatches?.length) {
        throw new Error(DUPLICATE_WORK_TITLE_MESSAGE);
    }
}

export function getWorkSaveErrorMessage(error) {
    const message = String(error?.message || '');
    if (
        error?.code === '23505' ||
        /slug|duplicate key/i.test(message)
    ) {
        return DUPLICATE_WORK_TITLE_MESSAGE;
    }
    return message || 'Failed to save this book. Please try again.';
}

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

    const slug = getCorpusSlug(cleanTitle);

    await ensureWorkTitleAvailable(supabaseClient, cleanTitle, slug);

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
        throw new Error(getWorkSaveErrorMessage(workError));
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