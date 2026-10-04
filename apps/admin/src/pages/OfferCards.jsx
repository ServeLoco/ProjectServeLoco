import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OfferCardsApi, CouponsApi, ImagesApi } from '../api';
import OfferCardProductsPanel from '../components/OfferCardProductsPanel';
import { readList } from '../utils/apiResponse';
import { getUploadedImage, normalizeImageUrl, FALLBACK_IMAGE, handleImageError } from '../utils/imageUrl';
import { getImageUploadError } from '../utils/fileValidation';
import { useStoreModes, modeLabel } from '../hooks/useStoreModes';
import PickAreaNotice from '../components/PickAreaNotice';
import { useAreaStore } from '../stores/useAreaStore';
import { GENERIC_ERROR } from '../utils/constants';
import './Offers.css';
import './OfferCards.css';

// The card templates (offer_cards.design). A card keeps its template; each
// has its own fields, look and preview.
const TEMPLATES = [
  {
    design: 'deal_tabs',
    name: 'Template 1 · Deal tabs',
    blurb: 'A Deal Price offer (Coupons page) with one tab per deal price — ₹9 / ₹29 / ₹49. Select picks the deal item.',
  },
  {
    design: 'deals_of_day',
    name: 'Template 2 · Deals of the day',
    blurb: 'Products you pick, each at its own price with the MRP struck through. ADD puts it in the cart; See all opens the full list.',
  },
];
const templateOf = (design) => TEMPLATES.find((t) => t.design === design) || TEMPLATES[0];

// Mirrors DEFAULT_STYLES in apps/api/src/controllers/offerCardController.js —
// the app falls back to these for any key a card leaves unset.
const DEFAULT_STYLE = {
  bgColor: '#EDE7FF',
  bgColorEnd: '#FFFFFF',
  accentColor: '#6C3BF5',
  titleColor: '#1F1147',
  subtitleColor: '#4B4470',
  tabColor: '#5B2FD6',
  tabActiveColor: '#FFFFFF',
  tabTextColor: '#FFFFFF',
  buttonColor: '#2F6BFF',
  buttonText: 'Select',
  footerText: 'View items at all prices',
  rowsPerTab: 3,
};
const DEFAULT_STYLES = {
  deal_tabs: DEFAULT_STYLE,
  deals_of_day: {
    ...DEFAULT_STYLE,
    bgColor: '#FFF6D8',
    bgColorEnd: '#FFE7A3',
    accentColor: '#E8590C',
    titleColor: '#D9480F',
    subtitleColor: '#8A5A12',
    tabColor: '#F2B705',
    buttonColor: '#2F6BFF',
    buttonText: 'ADD',
    footerText: 'See all',
    rowsPerTab: 4,
  },
};
const styleOf = (card) => ({ ...(DEFAULT_STYLES[card?.design] || DEFAULT_STYLE), ...(card?.style || {}) });

const DEAL_COLOR_FIELDS = [
  { key: 'bgColor', label: 'Background (top)' },
  { key: 'bgColorEnd', label: 'Background (bottom)' },
  { key: 'accentColor', label: 'Price chip & link' },
  { key: 'titleColor', label: 'Title text' },
  { key: 'subtitleColor', label: 'Subtitle text' },
  { key: 'tabColor', label: 'Tabs' },
  { key: 'tabActiveColor', label: 'Selected tab' },
  { key: 'tabTextColor', label: 'Tab text' },
  { key: 'buttonColor', label: 'Select button' },
];
const DAY_COLOR_FIELDS = [
  { key: 'bgColor', label: 'Background (top)' },
  { key: 'bgColorEnd', label: 'Background (bottom)' },
  { key: 'accentColor', label: 'Main colour & See all' },
  { key: 'titleColor', label: 'Title text' },
  { key: 'subtitleColor', label: 'Subtitle text' },
  { key: 'buttonColor', label: 'ADD button' },
];
const COLOR_FIELDS = { deal_tabs: DEAL_COLOR_FIELDS, deals_of_day: DAY_COLOR_FIELDS };

// Ready-made looks the admin can start from, then tweak.
const DEAL_PRESETS = [
  { name: 'Purple', style: {} },
  { name: 'Sunny', style: { bgColor: '#FFF4C2', bgColorEnd: '#FFFFFF', accentColor: '#E8590C', titleColor: '#4A2600', subtitleColor: '#6B4A1F', tabColor: '#F08C00', tabActiveColor: '#FFFFFF', tabTextColor: '#FFFFFF', buttonColor: '#E8590C' } },
  { name: 'Fresh', style: { bgColor: '#DDF7E3', bgColorEnd: '#FFFFFF', accentColor: '#2B8A3E', titleColor: '#0B3D1A', subtitleColor: '#2F5D3A', tabColor: '#2F9E44', tabActiveColor: '#FFFFFF', tabTextColor: '#FFFFFF', buttonColor: '#2B8A3E' } },
  { name: 'Berry', style: { bgColor: '#FFE3EC', bgColorEnd: '#FFFFFF', accentColor: '#C2255C', titleColor: '#4A0D24', subtitleColor: '#6E2A44', tabColor: '#D6336C', tabActiveColor: '#FFFFFF', tabTextColor: '#FFFFFF', buttonColor: '#C2255C' } },
];
const DAY_PRESETS = [
  { name: 'Sunny', style: {} },
  { name: 'Mint', style: { bgColor: '#E6F8EC', bgColorEnd: '#C9F0D6', accentColor: '#2B8A3E', titleColor: '#1E7B34', subtitleColor: '#2F5D3A' } },
  { name: 'Rose', style: { bgColor: '#FFE8EF', bgColorEnd: '#FFCFDD', accentColor: '#C2255C', titleColor: '#A61E4D', subtitleColor: '#6E2A44' } },
  { name: 'Sky', style: { bgColor: '#E3F2FF', bgColorEnd: '#C6E3FF', accentColor: '#1971C2', titleColor: '#1864AB', subtitleColor: '#2B4C6F' } },
];
const PRESETS = { deal_tabs: DEAL_PRESETS, deals_of_day: DAY_PRESETS };

const groupByPrice = (items) => {
  const map = new Map();
  items.filter((i) => i.active && !i.priceNotBelow).forEach((item) => {
    const list = map.get(item.dealPrice) || [];
    list.push(item);
    map.set(item.dealPrice, list);
  });
  return [...map.entries()].sort(([a], [b]) => a - b).map(([price, list]) => ({ price, items: list }));
};

/** An HTML stand-in for how the app draws a deal_tabs card. */
export function DealTabsCardPreview({ card, tiers, minOrder = 0 }) {
  const style = styleOf({ ...card, design: 'deal_tabs' });
  const [active, setActive] = useState(0);
  const tier = tiers[Math.min(active, Math.max(0, tiers.length - 1))];
  const rows = tier ? tier.items.slice(0, Number(style.rowsPerTab) || 3) : [];
  const imageUrl = normalizeImageUrl(card.image_url || card.imageUrl);

  return (
    <div className="oc-preview" style={{ background: `linear-gradient(180deg, ${style.bgColor} 0%, ${style.bgColorEnd} 70%)` }}>
      <div className="oc-preview-head">
        <div className="oc-preview-head-text">
          <div className="oc-preview-title" style={{ color: style.titleColor }}>{card.title || 'Card title'}</div>
          {/* Like the app: with a minimum order the "Shop for ₹X more" line
              takes the subtitle's place, so it is not said twice. */}
          {card.subtitle && !(minOrder > 0) && <div className="oc-preview-subtitle" style={{ color: style.subtitleColor }}>{card.subtitle}</div>}
        </div>
        {imageUrl && <img src={imageUrl} alt="" className="oc-preview-art" onError={handleImageError} />}
      </div>
      {minOrder > 0 && (
        <div className="oc-preview-progress">
          <div className="oc-preview-track" style={{ background: `${style.accentColor}22` }} />
          <div className="oc-preview-progress-text" style={{ color: style.accentColor }}>Shop for ₹{minOrder} more to claim</div>
        </div>
      )}
      {tiers.length === 0 ? (
        <div className="oc-preview-empty">Pick a deal with items to see its tabs.</div>
      ) : (
        <>
          <div className="oc-preview-tabs" style={{ background: style.tabColor }}>
            {tiers.map((t, index) => (
              <button
                type="button"
                key={t.price}
                className="oc-preview-tab"
                onClick={() => setActive(index)}
                style={index === active ? { background: style.tabActiveColor, color: style.titleColor } : { color: style.tabTextColor }}
              >
                <span className="oc-preview-chip" style={{ background: style.accentColor }}>₹{t.price}</span> Items
              </button>
            ))}
          </div>
          <div className="oc-preview-body">
            {rows.map((item) => (
              <div key={item.id} className="oc-preview-row">
                <img src={normalizeImageUrl(item.imageUrl) || FALLBACK_IMAGE} onError={handleImageError} alt="" />
                <div className="oc-preview-name">
                  <div>{item.name}</div>
                  <small>{item.variantLabel || item.unit || ''}</small>
                </div>
                <span className="oc-preview-select" style={{ color: style.buttonColor, borderColor: style.buttonColor }}>{style.buttonText}</span>
                <div className="oc-preview-price">
                  <s>₹{item.regularPrice}</s>
                  <b>₹{item.dealPrice}</b>
                </div>
              </div>
            ))}
            <div className="oc-preview-footer" style={{ color: style.accentColor }}>{style.footerText} »</div>
          </div>
        </>
      )}
    </div>
  );
}

/** An HTML stand-in for how the app draws a deals_of_day card. */
export function DealsOfDayCardPreview({ card, products }) {
  const style = styleOf({ ...card, design: 'deals_of_day' });
  const rows = products.slice(0, Number(style.rowsPerTab) || 4);
  const imageUrl = normalizeImageUrl(card.image_url || card.imageUrl);

  return (
    <div className="oc-preview oc-dod" style={{ background: `linear-gradient(180deg, ${style.bgColor} 0%, ${style.bgColorEnd} 100%)`, borderColor: `${style.accentColor}33` }}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="oc-dod-banner" onError={handleImageError} />
      ) : (
        <div className="oc-dod-head">
          <div className="oc-dod-title" style={{ color: style.titleColor, textShadow: `0 2px 0 ${style.accentColor}33` }}>{card.title || 'Card title'}</div>
          {card.subtitle && <div className="oc-preview-subtitle" style={{ color: style.subtitleColor }}>{card.subtitle}</div>}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="oc-preview-empty">Add products to see them here.</div>
      ) : (
        <div className="oc-dod-list">
          {rows.map((item) => (
            <div key={item.id} className="oc-dod-row">
              <img src={normalizeImageUrl(item.imageUrl) || FALLBACK_IMAGE} onError={handleImageError} alt="" />
              <div className="oc-preview-name">
                <div className="oc-dod-name">{item.name}</div>
                <small>{item.variantLabel || item.unit || ''}</small>
              </div>
              <span className="oc-dod-add" style={{ color: style.buttonColor, borderColor: style.buttonColor }}>{style.buttonText}</span>
              <div className="oc-preview-price">
                {item.mrp ? <s>₹{item.mrp}</s> : null}
                <b>₹{item.price}</b>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="oc-preview-footer oc-dod-footer" style={{ color: style.accentColor }}>{style.footerText} »</div>
    </div>
  );
}

// Loads a card's products (template 2) for its tile preview.
function useCardProducts(cardId) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!cardId) { setProducts([]); return undefined; }
    OfferCardsApi.products(cardId)
      .then((res) => { if (!cancelled) setProducts(readList(res)); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [cardId]);
  return products;
}

// Loads a deal's items once per deal id for previews.
const minOrderOf = (deals, dealId) => Number(deals.find((d) => String(d.id) === String(dealId))?.min_order_amount) || 0;

function useDealTiers(dealId) {
  const [tiers, setTiers] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!dealId) { setTiers([]); return undefined; }
    CouponsApi.dealItems(dealId)
      .then((res) => { if (!cancelled) setTiers(groupByPrice(readList(res))); })
      .catch(() => { if (!cancelled) setTiers([]); });
    return () => { cancelled = true; };
  }, [dealId]);
  return tiers;
}

function CardTile({ card, modes, minOrder, onEdit, onToggle }) {
  const isDayCard = card.design === 'deals_of_day';
  const tiers = useDealTiers(isDayCard ? null : card.deal_coupon_id);
  const products = useCardProducts(isDayCard ? card.id : null);
  return (
    <div className="oc-tile">
      {isDayCard
        ? <DealsOfDayCardPreview card={card} products={products} />
        : <DealTabsCardPreview card={card} tiers={tiers} minOrder={minOrder} />}
      <div className="oc-tile-meta">
        <div><b>{card.title}</b></div>
        <div className="oc-muted">
          {templateOf(card.design).name} •{' '}
          {isDayCard
            ? (products.length ? `${products.length} product${products.length === 1 ? '' : 's'}` : <span className="oc-danger">no products yet</span>)
            : <>Deal: {card.dealTitle || <span className="oc-danger">none — pick one</span>}</>}
          {' '}• {card.store_type === 'all' ? 'All modes' : modeLabel(modes, card.store_type)}
        </div>
        <div className="oc-tile-actions">
          <span className={`offer-status ${card.active ? 'active' : 'inactive'}`}>{card.active ? 'Active' : 'Inactive'}</span>
          <button type="button" className="btn-secondary" onClick={() => onToggle(card)}>{card.active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" className="btn-secondary" onClick={() => onEdit(card)}>Edit</button>
        </div>
      </div>
    </div>
  );
}

export default function OfferCards() {
  const { areaId } = useAreaStore() || {};
  const isAllAreas = areaId === 'all';
  const { modes } = useStoreModes();
  const [cards, setCards] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new

  const load = async () => {
    try {
      setLoading(true);
      const [cardsRes, couponsRes] = await Promise.all([OfferCardsApi.list({}), CouponsApi.list({})]);
      setCards(readList(cardsRes));
      setDeals(readList(couponsRes).filter((c) => c.discount_type === 'deal_price'));
      setError(null);
    } catch (err) {
      setError(err.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAllAreas) return;
    load();
  }, [isAllAreas]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (card) => {
    try {
      await OfferCardsApi.update(card.id, { active: !card.active });
      load();
    } catch (err) {
      setError(err.message || GENERIC_ERROR);
    }
  };

  if (isAllAreas) return <div className="offers-container"><PickAreaNotice label="Offer Cards" /></div>;

  return (
    <div className="offers-container">
      <header className="offers-header">
        <div>
          <h1 className="offers-title">Offer Cards</h1>
          <p className="oc-muted">
            Cards for the &quot;Offer Cards&quot; row on App Home. Pick a template for each card: Template 1 shows a Deal Price offer (made on the Coupons page) with one tab per price;
            Template 2 &ldquo;Deals of the day&rdquo; shows products you pick. After saving, add the card to an Offer Cards section on App Home.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}>+ New Card</button>
      </header>

      {error && <div className="error-container" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading cards...</div>
      ) : cards.length === 0 ? (
        <div className="oc-empty">
          No cards yet. Create one and pick its template.
        </div>
      ) : (
        <section className="oc-grid">
          {cards.map((card) => (
            <CardTile key={card.id} card={card} modes={modes} minOrder={minOrderOf(deals, card.deal_coupon_id)} onEdit={setEditing} onToggle={toggle} />
          ))}
        </section>
      )}

      {editing !== undefined && (
        <OfferCardDrawer
          key={editing?.id ?? 'new'}
          card={editing}
          deals={deals}
          modes={modes}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
          onCreated={async (id) => {
            // A product card's products are added once it exists: reopen it.
            load();
            try {
              const res = await OfferCardsApi.get(id);
              setEditing(res?.data || res);
            } catch {
              setEditing(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

// Stand-in content for the template picker's previews.
const SAMPLE_PRODUCTS = [
  { id: 1, name: 'Hide & Seek Parle', unit: '200 g', price: 39, mrp: 60 },
  { id: 2, name: 'Karachi Bakery Osmania', unit: '400 g', price: 140, mrp: 200 },
  { id: 3, name: 'Amul Butter', unit: '100 g', price: 56, mrp: 62 },
];
const SAMPLE_TIERS = [9, 29, 49].map((price) => ({
  price,
  items: [{ id: price, name: 'Chips Pack', unit: '1 packet', regularPrice: price + 11, dealPrice: price }],
}));

// <input type="datetime-local"> works in the admin's own clock, with no zone.
// The API sends and takes absolute instants (UTC ISO), so convert both ways —
// a bare "10:00" sent as is was read by the server in its own zone.
const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const localInputToIso = (local) => {
  if (!local) return null;
  const date = new Date(local); // read as the admin's local time
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function OfferCardDrawer({ card, deals, modes, onClose, onSaved, onCreated }) {
  const isEdit = Boolean(card);
  // A new card starts with the template choice; a saved one keeps its own.
  const [design, setDesign] = useState(card?.design || null);
  const [form, setForm] = useState(() => ({
    title: card?.title || '',
    subtitle: card?.subtitle || '',
    deal_coupon_id: card?.deal_coupon_id ? String(card.deal_coupon_id) : (deals[0] ? String(deals[0].id) : ''),
    store_type: card?.store_type || 'all',
    image_id: card?.image_id || '',
    image_url: card?.imageUrl || card?.image_url || '',
    active: card ? Boolean(card.active) : true,
    starts_at: toLocalInput(card?.starts_at),
    ends_at: toLocalInput(card?.ends_at),
    style: styleOf(card),
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);
  const isDayCard = design === 'deals_of_day';
  const tiers = useDealTiers(isDayCard ? null : form.deal_coupon_id);
  const [products, setProducts] = useState([]);
  const previewCard = useMemo(() => ({ ...form, design, image_url: form.image_url }), [form, design]);

  const chooseTemplate = (next) => {
    setDesign(next);
    setForm((prev) => ({ ...prev, style: { ...DEFAULT_STYLES[next] } }));
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setStyle = (key, value) => setForm((prev) => ({ ...prev, style: { ...prev.style, [key]: value } }));

  const upload = async (file) => {
    const sizeError = getImageUploadError(file);
    if (sizeError) { setMessage({ type: 'error', text: sizeError }); return; }
    const data = new FormData();
    data.append('image', file);
    const previous = form.image_id;
    try {
      setUploading(true);
      const res = await ImagesApi.upload(data);
      const image = getUploadedImage(res);
      setForm((prev) => ({ ...prev, image_id: String(image.id), image_url: image.url }));
      if (previous && previous !== card?.image_id) ImagesApi.delete(previous).catch(() => {});
      setMessage({ type: 'success', text: 'Image uploaded. Save the card to apply it.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || GENERIC_ERROR });
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload = {
      design,
      title: form.title,
      subtitle: form.subtitle,
      deal_coupon_id: !isDayCard && form.deal_coupon_id ? Number(form.deal_coupon_id) : null,
      store_type: form.store_type,
      image_id: form.image_id || null,
      active: form.active,
      starts_at: localInputToIso(form.starts_at),
      ends_at: localInputToIso(form.ends_at),
      style: { ...form.style, rowsPerTab: Number(form.style.rowsPerTab) || DEFAULT_STYLES[design].rowsPerTab },
    };
    try {
      if (isEdit) {
        await OfferCardsApi.update(card.id, payload);
        onSaved();
      } else {
        const res = await OfferCardsApi.create(payload);
        if (isDayCard && res?.id) onCreated(res.id);
        else onSaved();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || GENERIC_ERROR });
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this card? It is also removed from every App Home row.')) return;
    try {
      setSaving(true);
      await OfferCardsApi.delete(card.id);
      onSaved();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || GENERIC_ERROR });
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content oc-drawer" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h3 className="drawer-title">{isEdit ? 'Edit Offer Card' : 'New Offer Card'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>

          {!design ? (
            <div className="drawer-body">
              <p className="oc-muted" style={{ marginBottom: '0.75rem' }}>Pick a template. A card keeps its template; to change it, make a new card.</p>
              <div className="oc-templates">
                {TEMPLATES.map((t) => (
                  <button type="button" key={t.design} className="oc-template" onClick={() => chooseTemplate(t.design)}>
                    <div className="oc-template-preview">
                      {t.design === 'deals_of_day'
                        ? <DealsOfDayCardPreview card={{ title: 'Deals of the day', design: t.design }} products={SAMPLE_PRODUCTS} />
                        : <DealTabsCardPreview card={{ title: 'Items from ₹9 everyday!', design: t.design }} tiers={SAMPLE_TIERS} />}
                    </div>
                    <b>{t.name}</b>
                    <span className="oc-muted">{t.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div className="drawer-body oc-drawer-body">
            <div className="oc-drawer-form">
              {message && <p className={`upload-message ${message.type}`}>{message.text}</p>}

              <div className="oc-template-chip">
                {templateOf(design).name}
                {!isEdit && <button type="button" className="action-link" onClick={() => setDesign(null)}>Change</button>}
              </div>

              {!isDayCard && (
              <div className="form-group">
                <label className="form-label">Deal *</label>
                <select required className="form-select" value={form.deal_coupon_id} onChange={(e) => set('deal_coupon_id', e.target.value)}>
                  <option value="">Pick a deal price offer…</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>{d.title}{d.active ? '' : ' (inactive)'}</option>)}
                </select>
                {deals.length === 0 && <p className="oc-muted">No Deal Price offers yet — create one on the Coupons page (template &quot;Deal Price&quot;).</p>}
              </div>
              )}

              <div className="form-group">
                <label className="form-label">Title *</label>
                <input required maxLength={120} className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={isDayCard ? 'e.g. Deals of the day' : 'e.g. Items from ₹9 everyday!'} />
              </div>
              <div className="form-group">
                <label className="form-label">Subtitle</label>
                <p className="image-dimension-hint">
                  {isDayCard
                    ? 'Shown under the title on the card (when it has no header picture) and on its See all page.'
                    : <>Shown on the Deal page. On the Home card it shows only when the deal has no minimum order — otherwise the &ldquo;Shop for ₹X more&rdquo; line takes its place.</>}
                </p>
                <input maxLength={255} className="form-input" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder={isDayCard ? 'e.g. Fresh prices, today only' : 'e.g. Get any 1 item when you shop for ₹299'} />
              </div>

              {isDayCard && (
                <div className="form-group">
                  <label className="form-label">Products</label>
                  {isEdit
                    ? <OfferCardProductsPanel cardId={card.id} onChange={setProducts} />
                    : <p className="oc-muted">Save the card first — then you can add its products here.</p>}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Show in mode</label>
                <select className="form-select" value={form.store_type} onChange={(e) => set('store_type', e.target.value)}>
                  <option value="all">All modes</option>
                  {modes.map((m) => <option key={m.slug} value={m.slug}>{m.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{isDayCard ? 'Header picture (optional)' : 'Corner picture (optional)'}</label>
                <p className="image-dimension-hint">
                  {isDayCard
                    ? 'Wide art across the top of the card, like "DEALS OF THE DAY". Recommended 900 × 300 px PNG or WebP. Without it, the title shows big and bold.'
                    : 'Small art in the top-right corner. Recommended 300 × 300 px PNG or WebP with a transparent background.'}
                </p>
                <div className="oc-image-row">
                  {form.image_url && <img src={normalizeImageUrl(form.image_url)} alt="" className="oc-image-thumb" />}
                  <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : form.image_url ? 'Change picture' : 'Upload picture'}
                  </button>
                  {form.image_url && <button type="button" className="action-link danger" onClick={() => setForm((prev) => ({ ...prev, image_id: '', image_url: '' }))}>Remove</button>}
                  <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Look</label>
                <div className="oc-presets">
                  {PRESETS[design].map((p) => (
                    <button
                      type="button" key={p.name} className="oc-preset"
                      style={{
                        background: p.style.bgColor || DEFAULT_STYLES[design].bgColor,
                        borderColor: isDayCard ? (p.style.accentColor || DEFAULT_STYLES[design].accentColor) : (p.style.tabColor || DEFAULT_STYLE.tabColor),
                      }}
                      onClick={() => setForm((prev) => ({ ...prev, style: { ...prev.style, ...DEFAULT_STYLES[design], ...p.style, buttonText: prev.style.buttonText, footerText: prev.style.footerText, rowsPerTab: prev.style.rowsPerTab } }))}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="oc-colors">
                  {COLOR_FIELDS[design].map(({ key, label }) => (
                    <label key={key} className="oc-color">
                      <input type="color" value={(form.style[key] || DEFAULT_STYLES[design][key]).slice(0, 7)} onChange={(e) => setStyle(key, e.target.value.toUpperCase())} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row-2 oc-two">
                <div className="form-group">
                  <label className="form-label">Button text</label>
                  <input maxLength={20} className="form-input" value={form.style.buttonText} onChange={(e) => setStyle('buttonText', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{isDayCard ? 'Products on the card' : 'Products per tab'}</label>
                  <input type="number" min={1} max={6} className="form-input" value={form.style.rowsPerTab} onChange={(e) => setStyle('rowsPerTab', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Link text at the bottom</label>
                <input maxLength={60} className="form-input" value={form.style.footerText} onChange={(e) => setStyle('footerText', e.target.value)} />
              </div>

              <div className="form-row-2 oc-two">
                <div className="form-group">
                  <label className="form-label">Show from (optional)</label>
                  <input type="datetime-local" className="form-input" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Show until (optional)</label>
                  <input type="datetime-local" className="form-input" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
                </div>
              </div>

              <label className="checkbox-label">
                <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                Card is active
              </label>
            </div>

            <div className="oc-drawer-preview">
              <div className="oc-muted" style={{ marginBottom: '0.5rem' }}>{isDayCard ? 'Preview' : 'Preview (tap a tab)'}</div>
              {isDayCard
                ? <DealsOfDayCardPreview card={previewCard} products={products} />
                : <DealTabsCardPreview card={previewCard} tiers={tiers} minOrder={minOrderOf(deals, form.deal_coupon_id)} />}
            </div>
          </div>
          )}

          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={remove} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete Card
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!design || saving || uploading}>{saving ? 'Saving...' : 'Save Card'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
