import type { Mood, NewsItem } from '../game/news.ts';
import { AtlasSprite } from './AtlasSprite.tsx';

const MOOD_LABEL: Record<Mood, string> = {
  happy: 'pleased',
  neutral: 'wary',
  angry: 'unhappy',
};

/**
 * The quarterly briefing: a fictional local paper's front page for the quarter that just ended,
 * with stakeholder reactions to the player's decisions (flavour; game/news.ts).
 */
export function Briefing({ item, date }: { item: NewsItem; date: string }) {
  return (
    <article class="briefing" aria-labelledby="news-h" data-testid="briefing">
      <p class="masthead">
        <AtlasSprite name="icon_news" />
        <span>The Daily Zoning</span>
        <span class="masthead-date">{date}</span>
      </p>
      <h2 id="news-h">{item.headline}</h2>
      {item.lines.length > 0 && (
        <p class="news-lines">
          {item.lines.map((l, i) => (
            <span key={i}>{l} </span>
          ))}
        </p>
      )}
      {item.reactions.length > 0 && (
        <ul class="reactions" aria-label="Reactions">
          {item.reactions.map((r) => (
            <li key={r.who}>
              <AtlasSprite name={`face_${r.mood}`} />
              <span>
                <strong>{r.who}</strong> <span class="mood">({MOOD_LABEL[r.mood]})</span>:{' '}
                {`“${r.text}”`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
