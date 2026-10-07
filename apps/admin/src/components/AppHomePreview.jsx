import React from 'react';
import AdminIcon from './AdminIcon';
import { normalizeImageUrl, handleImageError, FALLBACK_IMAGE } from '../utils/imageUrl';

const PREVIEW_ICON_PATHS = {
  shoppingBag: 'M5 7h14l1 14H4z M9 8V6a3 3 0 0 1 6 0v2',
  box: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  ticket: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M14 6v12',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
};
function PreviewIcon({ name, size = 16 }) {
  const path = PREVIEW_ICON_PATHS[name];
  return path ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg> : <AdminIcon name={name} size={size} />;
}
const DEFAULT_ICONS = { category_grid: 'box', product_block: 'shoppingBag', combo_block: 'star', offer_cards: 'ticket' };

export default function AppHomePreview({ section, draft, modeName }) {
  const settings = draft || section;
  const type = settings?.section_type;
  const limit = Math.max(1, Number(settings?.max_visible_items) || 1);
  const items = (section?.items || []).filter(item => item.active === undefined || Boolean(Number(item.active))).slice(0, limit);
  const isBanner = type === 'offer_banner';
  const isCategory = type === 'category_grid';
  const isOfferCard = type === 'offer_cards';
  const starts = settings?.starts_at ? new Date(settings.starts_at) : null;
  const ends = settings?.ends_at ? new Date(settings.ends_at) : null;
  const status = !Number(settings?.active) ? 'Hidden' : ends && ends < new Date() ? 'Schedule ended' : starts && starts > new Date() ? 'Scheduled' : 'Active';

  return (
    <aside className="home-preview-panel" aria-label="Section preview">
      <header className="home-preview-header">
        <div><span className="home-eyebrow">PREVIEW</span><h2>Selected section</h2></div>
        <span className="home-draft-label">Draft preview</span>
      </header>
      <p className="home-preview-caption">See your edits before saving. This is an illustrative section preview; availability and automatic content are resolved in the app.</p>
      <div className="home-phone">
        <div className="home-phone-top"><span>VillKro</span><PreviewIcon name="shoppingBag" size={19} /></div>
        <div className="home-phone-location"><AdminIcon name="home" size={14} /> Your home, delivered</div>
        <div className="home-phone-search"><AdminIcon name="search" size={15} /> Search for your favourites</div>
        <div className="home-phone-mode">{modeName}</div>
        <div className="home-phone-content">
          {!section ? (
            <div className="home-preview-empty"><AdminIcon name="appHome" size={30} /><strong>Your content, at a glance</strong><p>Select a section to preview its title, items and display settings.</p></div>
          ) : (
            <>
              {!isBanner && settings.title && (
                <div className="home-preview-section-title">
                  <PreviewIcon name={settings.section_icon || DEFAULT_ICONS[type]} size={15} />
                  <strong>{settings.title}</strong>
                  {Boolean(Number(settings.show_hot_badge)) && <span className="home-preview-hot">HOT</span>}
                  {!isCategory && Boolean(Number(settings.show_see_all)) && <span className="home-preview-see-all">See all</span>}
                </div>
              )}
              {section.auto_kind ? (
                <div className="home-preview-auto"><AdminIcon name="reorder" size={23} /><strong>Automatic {section.auto_kind} row</strong><p>The app selects up to {limit} items from this {section.auto_kind}. This editor does not load those items.</p></div>
              ) : items.length === 0 ? (
                <div className="home-preview-empty"><p>No assigned items to preview. Assign an item to build this section.</p></div>
              ) : isBanner ? (
                <div className="home-preview-banners">
                  {items.map(item => {
                    const details = item.details || {};
                    return <img key={item.id} src={normalizeImageUrl(details.imageUrl || details.image_url) || FALLBACK_IMAGE} onError={handleImageError} alt={details.title || 'Offer banner'} />;
                  })}
                </div>
              ) : (
                <div className={`home-preview-rail ${isCategory ? 'categories' : ''} ${isOfferCard ? 'offers' : ''}`}>
                  {items.map(item => {
                    const details = item.details || {};
                    const name = details.name || details.title || `Item #${item.item_id}`;
                    return (
                      <article key={item.id} className="home-preview-item">
                        <img src={normalizeImageUrl(details.imageUrl || details.image_url) || FALLBACK_IMAGE} onError={handleImageError} alt={name} />
                        <strong>{name}</strong>
                        {isOfferCard && <span>{details.design === 'deals_of_day' ? 'Deals of the day' : details.deal_title || 'Offer card'}</span>}
                        {!isCategory && !isOfferCard && details.price != null && <span className="home-preview-price">₹{Number(details.price).toLocaleString('en-IN')}</span>}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="home-phone-nav"><span><AdminIcon name="home" size={17} />Home</span><span><PreviewIcon name="box" size={17} />Categories</span><span><AdminIcon name="orders" size={17} />Orders</span></div>
      </div>
      {section && <div className="home-preview-summary"><span className={`badge ${status === 'Active' ? 'badge-status-active' : 'badge-status-hidden'}`}>{status}</span><span>{section.auto_kind ? `Up to ${limit} automatic items` : `${items.length} of ${section.items?.length || 0} assigned items shown`}</span></div>}
      {isBanner && section && <p className="home-preview-caption">Scroll to inspect banners. The customer app rotates active banners every 4 seconds.</p>}
      {isOfferCard && section && <p className="home-preview-caption">Offer card templates and deal tabs are configured on the Offer Cards page.</p>}
    </aside>
  );
}
