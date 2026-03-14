import * as React from 'react'
import { type LayoutItem as ApiLayoutItem, type Article } from './api'
import KebabIcon from './icons/KebabIcon'
import RefreshIcon from './icons/RefreshIcon'
import TrashIcon from './icons/TrashIcon'

interface WidgetProps {
  item: ApiLayoutItem
  isMenuOpen: boolean
  isRefreshing: boolean
  onMenuToggle: () => void
  onRefresh: () => void
  onDelete: () => void
}

const Widget: React.FC<WidgetProps> = ({
  item,
  isMenuOpen,
  isRefreshing,
  onMenuToggle,
  onRefresh,
  onDelete,
}) => {
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">
          {item.i}
          <button
            className={`widget-refresh-btn${isRefreshing ? ' is-refreshing' : ''}`}
            disabled={isRefreshing}
            onClick={(e) => {
              e.stopPropagation()
              onRefresh()
            }}
          >
            <RefreshIcon />
          </button>
        </div>
        <div className="widget-menu-wrap">
          <button
            className="widget-menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              onMenuToggle()
            }}
          >
            <KebabIcon />
          </button>
          {isMenuOpen && (
            <div className="widget-menu" onClick={(e) => e.stopPropagation()}>
              <button
                className="widget-menu-item widget-menu-item--danger"
                onClick={() => onDelete()}
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="widget-body">
        {item.items && item.items.length > 0 ? (
          <ul className="article-list">
            {item.items.map((article) => (
              <li
                key={article.url}
                className={`article-item${article.new ? ' article-item--new' : ''}`}
              >
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-link"
                >
                  <span className="article-title">{article.title}</span>
                  {article.image && (
                    <img src={article.image} alt="" className="article-image" />
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="widget-placeholder">No articles yet</p>
        )}
      </div>
    </div>
  )
}

export default Widget
