interface HighlightTextProps {
    text: string | number | undefined | null;
    searchTerm: string;
}

export function HighlightText({ text, searchTerm }: HighlightTextProps) {
    const textStr = text != null ? String(text) : '';

    if (!searchTerm.trim() || !textStr) {
        return <>{textStr}</>;
    }

    const term = searchTerm.trim();
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = textStr.split(regex);

    return (
        <>
            {parts.map((part, index) =>
                regex.test(part) ? (
                    <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px', fontWeight: 'bold' }}>
                        {part}
                    </mark>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    );
}
