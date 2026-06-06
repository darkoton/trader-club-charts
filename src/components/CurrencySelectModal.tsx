/**
 * Currency selection modal — PocketOption-style.
 *
 * Layout: Category icons (horizontal) → Search → Scrollable currency list.
 * Each item: ★ fav | icon | name | profit%
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCurrencies, getCategories, type Currency, type CategoryInfo } from '../api/currencies';
import { getIconOverrides } from '../api/admin';
import { betterSocket } from '../api/betterSocket';
import { useAccountBonus } from '../hooks/useAccountBonus';
import { useI18n } from '../i18n';
import { getCategoryIcon, getCurrencyDisplayIcon, renderIcon } from '../utils/icons';
import { resolveDisplayPayout } from '../utils/payout';

interface CurrencySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (currency: Currency, chartData: unknown) => void;
  favorites: string[];
  onToggleFavorite: (currency: string) => void;
  autoCloseOnSelect?: boolean;
}

/**
 * Inserts a transparent full-screen div for ~500ms that absorbs the
 * ghost click browsers synthesize ~300ms after a touchend event.
 * React's synthetic onTouchEnd cannot reliably call preventDefault on
 * passive touch listeners, so we use a native DOM shield instead.
 */
function installTapShield() {
  const shield = document.createElement('div');
  shield.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:all;';
  shield.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true });
  shield.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, passive: false } as AddEventListenerOptions);
  document.body.appendChild(shield);
  setTimeout(() => { if (document.body.contains(shield)) document.body.removeChild(shield); }, 500);
}

export function CurrencySelectModal({ isOpen, onClose, onSelect, favorites, onToggleFavorite, autoCloseOnSelect = true }: CurrencySelectModalProps) {
  const { t, tCategory } = useI18n();
  const { applyBonus } = useAccountBonus();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setPoAssetsRevision] = useState(0);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const unsub = betterSocket.onPoAssets(() => setPoAssetsRevision((value) => value + 1));
    return unsub;
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [currData, catData, iconOverrides] = await Promise.all([
        getCurrencies(undefined, true),
        getCategories(),
        getIconOverrides().catch(() => ({ categories: {}, currencies: {} } as { categories: Record<string, string>; currencies: Record<string, string> })),
      ]);

      // Merge admin icon overrides into categories
      const mergedCats: CategoryInfo[] = catData.map((cat) => ({
        ...cat,
        icon: iconOverrides.categories[cat.name] || cat.icon,
      }));

      // Build category icon map and apply to currencies
      const catIconMap: Record<string, string> = {};
      for (const cat of mergedCats) {
        if (cat.icon) catIconMap[cat.name] = cat.icon;
      }
      setCurrencies(
        currData.map((c) => {
          const curIcon = iconOverrides.currencies[c.currency] || c.icon;
          const catIcon = catIconMap[c.category] || c.category_icon;
          return { ...c, icon: curIcon, category_icon: catIcon };
        }),
      );
      
      // Sort categories in custom order
      const categoryOrder = [
        'currency', 'forex',           // Валюты
        'cryptocurrency', 'crypto',     // Криптовалюты
        'commodities', 'commodity',     // Сырьевые товары
        'stocks', 'stock', 'shares',    // Акции
        'indices', 'index',             // Индексы
      ];
      
      const sortedCategories = [...mergedCats].sort((a, b) => {
        const indexA = categoryOrder.indexOf(a.name.toLowerCase());
        const indexB = categoryOrder.indexOf(b.name.toLowerCase());
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setCategories(sortedCategories);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadCurrencies);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCurrency = useCallback((currency: Currency) => {
    onSelect(currency, null);
    if (!autoCloseOnSelect) return;
    // Install a tap-shield overlay that absorbs the ghost click browsers
    // fire ~300ms after touchend, then close the modal.
    installTapShield();
    requestAnimationFrame(() => onClose());
  }, [autoCloseOnSelect, onSelect, onClose]);

  const toggleFav = useCallback((e: React.MouseEvent, currencyName: string) => {
    e.stopPropagation();
    onToggleFavorite(currencyName);
  }, [onToggleFavorite]);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return currencies.filter((c) => {
      if (selectedCategory === 'favorites') {
        if (!favorites.includes(c.currency)) return false;
      } else if (selectedCategory !== 'all') {
        if (c.category !== selectedCategory) return false;
      }
      if (q && !c.currency.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [currencies, selectedCategory, searchQuery, favorites]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--currency" onClick={(e) => e.stopPropagation()}>
        {/* ─── Category icon bar ─── */}
        <div className="cm-catbar">
          <button
            className={`cm-catbar__btn${selectedCategory === 'all' ? ' cm-catbar__btn--active' : ''}`}
            onClick={() => setSelectedCategory('all')}
            title={t.all}
          >
            <span className="cm-catbar__icon">🌐</span>
            <span className="cm-catbar__label">{t.all}</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              className={`cm-catbar__btn${selectedCategory === cat.name ? ' cm-catbar__btn--active' : ''}`}
              onClick={() => setSelectedCategory(cat.name)}
              title={tCategory(cat.name)}
            >
              <span className="cm-catbar__icon">{renderIcon(getCategoryIcon(cat.name, cat.icon), 16)}</span>
              <span className="cm-catbar__label">{tCategory(cat.name)}</span>
            </button>
          ))}
        </div>

        {/* ─── Search + Favorites filter ─── */}
        <div className="cm-searchbar">
          <div className="cm-searchbar__input-wrap">
            <svg className="cm-searchbar__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="cm-searchbar__input"
              type="text"
              placeholder={t.searchCurrency}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button
            className={`cm-searchbar__fav-btn${selectedCategory === 'favorites' ? ' cm-searchbar__fav-btn--active' : ''}`}
            onClick={() => setSelectedCategory(selectedCategory === 'favorites' ? 'all' : 'favorites')}
            title={t.favorites}
          >
            ★
          </button>
        </div>

        {/* ─── Currency list ─── */}
        <div className="cm-list">
          {error && <div className="error-msg">{error}</div>}

          {loading ? (
            <div className="loading">
              <div className="loading__spinner" />
              {t.loading}
            </div>
          ) : filteredCurrencies.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">📭</span>
              <span>{t.currenciesNotFound}</span>
            </div>
          ) : (
            filteredCurrencies.map((c) => {
              const isFav = favorites.includes(c.currency);
              return (
                <div
                  key={c.currency}
                  className="cm-item"
                  onClick={() => handleSelectCurrency(c)}
                >
                  <button
                    className={`cm-item__fav${isFav ? ' cm-item__fav--active' : ''}`}
                    onClick={(e) => toggleFav(e, c.currency)}
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                  <span className="cm-item__cat-icon">{renderIcon(getCurrencyDisplayIcon(c.category, c.icon, c.category_icon), 16)}</span>
                  <span className="cm-item__name">{c.currency}</span>
                  {(() => {
                    const payout = resolveDisplayPayout({
                      currency: c.currency,
                      apiName: c.api_name ?? null,
                      fallbackProfit: c.profit,
                    });
                    if (payout === undefined) return null;
                    const displayPayout = applyBonus(payout);
                    return (
                      <span className={`cm-item__profit ${displayPayout >= 0 ? 'cm-item__profit--up' : 'cm-item__profit--down'}`}>{displayPayout.toFixed(0)}%</span>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
