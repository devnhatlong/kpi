export class Helper {
    static slugify = (text: string): string => {
        return text
            .toLowerCase()
            .trim()
            .replace(/đ/g, 'd')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    };
}