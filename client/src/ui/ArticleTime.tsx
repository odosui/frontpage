import { type FeedArticle } from '../api'
import { formatWhen, timeAgo } from '../utils/dates'

const ArticleTime = ({ article }: { article: FeedArticle }) => {
  const published = article.publishedAt
  const when = published ?? article.createdAt

  return (
    <time
      dateTime={when}
      title={
        published
          ? `Published ${formatWhen(published)}`
          : `Collected ${formatWhen(article.createdAt)}`
      }
    >
      {timeAgo(when)}
    </time>
  )
}

export default ArticleTime
