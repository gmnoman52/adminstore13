import { ShoppingRequests } from './ShoppingRequests';
import { Reports } from './Reports';
import { CatalogueImage } from './CatalogueImage';
import { PrivacyRequests } from './PrivacyRequests';
import { Inbox } from './Inbox';
import { Footer } from './Footer';
import { setPageMetadata } from './metadata';
import { compressProductImage } from './image';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, db, errorText, label, money, nextStatuses, paisa, rupees, OWNER_SESSION_KEY, type Category, type Order, type Product, type Settings } from './api';
import { useLoad } from './useLoad';
import './App.css';

// This internal login identifier is not a mailbox or a secret. Supabase verifies the passcode.
const OWNER_LOGIN = 'owner@united-super-store.invalid';

function Message({ error, children }: { error?: boolean; children: ReactNode }) { return children ? <p className={error ? 'message error' : 'message'} role={error ? 'alert' : 'status'}>{children}</p> : null; }
function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
function Loading() { return <p className="loading" role="status">Loading…</p>; }
function Pager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) { return <div className="pager"><span>{count ? `${page * 25 + 1}–${Math.min((page + 1) * 25, count)} of ${count}` : '0 results'}</span><button className="quiet" disabled={!page} onClick={() => onPage(page - 1)}>Previous</button><button className="quiet" disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>; }
function Brand() { return <a className="brand" href="/#dashboard" aria-label="United Super Store admin home"><img src="/logo-small.png" width="48" height="48" alt="United Super Store"/><span>United Super Store<small>Store administration</small></span></a>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [locked, setLocked] = useState(false);
  useEffect(()=>{if (!session && (location.pathname === '/' || location.pathname === '/index.html')) setPageMetadata('Admin login','Secure owner access to United Super Store products, inventory and orders');},[session]);
  useEffect(() => {
    let alive = true;
    db.auth.getSession().then(({ data, error }) => { if (alive) { setSession(data.session); setLoading(false); if (error) setAuthError(error.message); } }).catch(error => { if (alive) { setLoading(false); setAuthError(errorText(error)); } });
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false);  });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let lastActivity = Date.now();
    let signingOut = false;
    const activity = (event: Event) => { if (event.isTrusted) lastActivity = Date.now(); };
    const check = () => {
      if (!signingOut && Date.now() - lastActivity >= 30 * 60 * 1000) {
        signingOut = true;
        setLocked(true);
        db.auth.stopAutoRefresh();
        const finish = () => { window.sessionStorage.removeItem(OWNER_SESSION_KEY); window.location.replace('/'); };
        // Do not leave cached owner data visible while an offline logout retries.
        const fallback = window.setTimeout(finish, 2000);
        void db.auth.signOut({scope:'local'}).catch(() => {}).finally(() => { clearTimeout(fallback); finish(); });
      }
    };
    const timer = window.setInterval(check, 30000);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); document.removeEventListener('visibilitychange', check); };
  }, [userId]);
  if (location.pathname !== '/' && location.pathname !== '/index.html') return <NotFound/>;
  if (locked) return <main className="login"><Brand/><h1>Session locked</h1><p>Your session ended after inactivity. Returning to sign-in…</p></main>;
  if (!configured) return <main className="login"><Brand/><Message error>Configure the Supabase URL and publishable key to open the admin panel</Message><Footer/></main>;
  if (loading) return <main className="login"><Brand/><Loading/></main>;
  if (!session) return <Login initialError={authError}/>;
  return <Access key={session.user.id} session={session}/>;
}

function Login({ initialError }: { initialError: string }) {
  const [visible,setVisible] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await db.auth.signInWithPassword({ email: OWNER_LOGIN, password: passcode });
      if (error) throw error;
      setPasscode('');
    } catch (error) {
      setMessage(error && typeof error === 'object' && 'status' in error && error.status === 429 ? 'Too many attempts. Please wait before trying again' : 'Couldn’t unlock the admin panel. Check your passcode and connection');
    } finally { setPasscode(''); setBusy(false); }
  }
  return <main className="login"><Brand/><h1>Unlock your store</h1><p>Enter your owner passcode to manage United Super Store</p><form onSubmit={submit}><fieldset disabled={busy}>
    <label>Admin passcode<input type={visible ? "text" : "password"} autoComplete="current-password" maxLength={72} value={passcode} onChange={event => setPasscode(event.target.value)} required autoFocus/></label><button type="button" className="quiet" aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?"Hide passcode":"Show passcode"}</button>
    <Message error>{message}</Message><button type="submit">{busy ? 'Unlocking…' : 'Unlock admin panel'}</button>
  </fieldset></form><p className="footnote">Owner access only. Your passcode is verified securely by the server. Sessions end after 30 minutes without activity and require a new login after eight hours.</p><Footer/></main>;
}

function Access({ session }: { session: Session }) {
  const load = useCallback(async () => { if (!session.access_token) return false; const { data, error } = await db.rpc('is_admin'); if (error) throw error; return Boolean(data); }, [session.access_token]);
  const access = useLoad(load);
  const [error, setError] = useState('');
  async function logout() { const { error } = await db.auth.signOut(); if (error) setError(error.message); }
  if (access.loading) return <main className="login"><Brand/><Loading/></main>;
  if (!access.data) return <main className="login"><Brand/><h1>Owner access required</h1><p>This account has not been granted store management access.</p><Message error>{access.error || error}</Message><div className="actions"><button onClick={access.refresh}>Check access again</button><button className="quiet" onClick={logout}>Log out</button></div><Footer/></main>;
  return <Panel logout={logout} logoutError={error}/>;
}

const pages = ['dashboard', 'products', 'categories', 'orders', 'reports', 'requests', 'messages', 'privacy', 'settings'] as const;
type Page = typeof pages[number] | 'not-found';
const currentPage = (): Page => pages.includes(location.hash.slice(1) as (typeof pages)[number]) ? location.hash.slice(1) as Page : location.hash ? 'not-found' : 'dashboard';
function Panel({ logout, logoutError }: { logout: () => void; logoutError: string }) {
  const [page, setPage] = useState<Page>(currentPage);
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{setPageMetadata(page==='not-found'?'Page not found':label(page),`Manage United Super Store ${page==='not-found'?'navigation':page}`);},[page]);
  useEffect(() => { const onHash = () => {setPage(currentPage());setMenuOpen(false);}; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  return <div className="shell"><aside className="sidebar"><Brand/><button className="menu-toggle quiet" aria-expanded={menuOpen} aria-controls="admin-menu" onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?'Close menu':'Menu'}</button><nav id="admin-menu" className={menuOpen?'is-open':''} aria-label="Administration">{pages.map(item => <a key={item} href={`#${item}`} onClick={()=>setMenuOpen(false)} aria-current={page === item ? 'page' : undefined}>{label(item)}</a>)}</nav><p className="sidebar-note">United Super Store<br/>Owner workspace</p></aside><div className="workspace"><header className="topbar"><div><h1>{page==='not-found'?'Page not found':label(page)}</h1><p>Owner workspace</p></div><button className="quiet" onClick={logout}>Log out</button></header><main><Message error>{logoutError}</Message>{page === 'not-found' ? <NotFound embedded/> : page === 'dashboard' ? <Dashboard/> : page === 'products' ? <Products/> : page === 'categories' ? <Categories/> : page === 'orders' ? <Orders/> : page === 'reports' ? <Reports/> : page === 'requests' ? <ShoppingRequests/> : page === 'messages' ? <Inbox/> : page === 'privacy' ? <PrivacyRequests/> : <StoreSettings/>}</main><Footer navigation/></div></div>;
}

function NotFound({embedded=false}:{embedded?:boolean}) { useEffect(()=>{setPageMetadata('Page not found','This admin page could not be found. Return to the dashboard.');},[]); const content=<><h2>Page not found</h2><p>The link may be incorrect or this page may have moved</p><a className="button" href="/#dashboard">Back to dashboard</a></>; return embedded?<section className="empty">{content}</section>:<main className="login"><Brand/>{content}<Footer/></main>; }

function Dashboard() {
  const load = useCallback(async () => {
    const results = await Promise.all([
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('stock_confirmed',true).eq('stock', 0),
      db.from('orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,cancelled)'),
      db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    for (const result of results) if (result.error) throw result.error;
    return results.map(result => result.count ?? 0);
  }, []);
  const resource = useLoad(load);
  return <><div className="section-head"><h2>Your store at a glance</h2><button className="quiet" onClick={resource.refresh} disabled={resource.loading}>Refresh</button></div><Message error>{resource.error}</Message>{resource.loading ? <Loading/> : <div className="stats">{['Products', 'Active products out of stock', 'Open orders', 'Awaiting acceptance'].map((title, i) => <section key={title}><h3>{title}</h3><p>{resource.data?.[i] ?? 0}</p></section>)}</div>}<section className="welcome"><h2>Ready when your store is</h2><p>Add your real products, set your fulfilment options, then enable orders in store settings.</p><a className="button" href="#products">Manage products</a><a className="text-link" href="#settings">Store settings</a></section></>;
}

function Products() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<Product | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => {
    let query = db.from('products').select('*', { count: 'exact' }).order('name').order('id').range(page * 25, page * 25 + 24);
    if (search.trim()) query = query.ilike('name', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    if (filter !== 'all') query = query.eq('is_active', filter === 'active');
    const { data, count, error } = await query; if (error) throw error;
    return { rows: data as Product[], count: count ?? 0 };
  }, [page, search, filter]);
  const resource = useLoad(load);
  async function remove(product: Product) {
    if (!window.confirm(`Delete ${product.name}? Existing order records will be kept.`)) return;
    setDeleting(true); setError(''); setNotice('');
    try { const { error } = await db.from('products').delete().eq('id', product.id).eq('updated_at',product.updated_at).select('id').single(); if (error) throw error; setNotice('Product deleted'); setPage(0); resource.refresh(); }
    catch (error) { setError(errorText(error)); } finally { setDeleting(false); }
  }
  if (editor) return <ProductEditor product={editor === 'new' ? null : editor} onCancel={() => { if (window.confirm('Discard unsaved product changes?')) setEditor(null); }} onSaved={() => { setEditor(null); setNotice('Product saved'); setPage(0); resource.refresh(); }}/>;
  return <><div className="section-head"><div><h2>Product catalogue</h2><p>Add and manage your real store inventory</p></div><button onClick={() => { setEditor('new'); setNotice(''); }}>Add product</button></div><div className="filters"><label>Search products<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/></label><label>Visibility<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button className="quiet" onClick={resource.refresh} disabled={resource.loading}>Refresh</button></div><Message>{notice}</Message><Message error>{error || resource.error}</Message>{resource.loading ? <Loading/> : !resource.data?.rows.length ? <Empty><h3>No products to show</h3><p>Add a product or adjust your filters</p></Empty> : <div className="table-wrap"><table><caption className="sr-only">Store products</caption><thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Visibility</th><th scope="col">Actions</th></tr></thead><tbody>{resource.data.rows.map(product => <tr key={product.id}><td data-label="Product"><div className="catalogue-product"><CatalogueImage product={product}/><div><strong>{product.name}</strong><small>{product.unit}</small>{product.product_code&&<small>Code: {product.product_code}</small>}</div></div></td><td data-label="Price" className={product.price_confirmed?'number':''}>{product.price_confirmed?money(product.price_paisa):<>Price confirmation needed<small>Candidate: {money(product.price_paisa)}</small></>}</td><td data-label="Stock">{product.stock_confirmed?product.stock:'Confirm with store'}</td><td data-label="Visibility">{product.is_active ? 'Active' : 'Inactive'}</td><td data-label="Actions"><div className="row-actions"><button className="quiet" onClick={() => setEditor(product)} aria-label={`Edit ${product.name}`}>Edit</button><button className="danger quiet" onClick={() => void remove(product)} disabled={deleting} aria-label={`Delete ${product.name}`}>Delete</button></div></td></tr>)}</tbody></table></div>}<Pager page={page} count={resource.data?.count ?? 0} onPage={setPage}/></>;
}

function ProductEditor({ product, onSaved, onCancel }: { product: Product | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [productCode,setProductCode]=useState(product?.product_code??'');
  const [priceConfirmed,setPriceConfirmed]=useState(product?.price_confirmed??true);
  const [stockConfirmed,setStockConfirmed]=useState(product?.stock_confirmed??true);
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? rupees(product.price_paisa) : '');
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [category, setCategory] = useState(product?.category_id ?? '');
  const [active, setActive] = useState(product?.is_active ?? false);
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [imageRights,setImageRights] = useState(false);
  const needsImageRights=Boolean(file || (imageUrl.trim() && imageUrl.trim()!==(product?.image_url??'')));
  const imagePrefix=import.meta.env.VITE_SUPABASE_URL+'/storage/v1/object/public/product-images/';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => { const { data, error } = await db.from('categories').select('*').order('name'); if (error) throw error; return data as Category[]; }, []);
  const categories = useLoad(load);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); let uploaded: string | null = null;
    try {
      const amount = paisa(price);
      if (!/^\d+$/.test(stock) || Number(stock) > 2147483647) throw new Error('Enter a valid whole-number stock quantity');
      if (!name.trim() || !unit.trim()) throw new Error('Product name and unit are required');
      if(productCode.trim()&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(productCode.trim()))throw new Error('Use letters, numbers, dots, underscores or hyphens for the product code');
      let url = imageUrl.trim() || null;
      if (!file && url && !url.startsWith(imagePrefix)) throw new Error('Use a photo uploaded to this store’s product-images storage; external tracking image URLs are not accepted');
      if (needsImageRights && !imageRights) throw new Error('Confirm that you own this image or have permission to use it commercially');
      if (file) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5242880) throw new Error('Choose a JPG, PNG or WebP image up to 5 MB');
        const compressed = await compressProductImage(file);
        const path = `${crypto.randomUUID()}.${compressed.type === 'image/jpeg' ? 'jpg' : compressed.type.split('/')[1]}`;
        const { error } = await db.storage.from('product-images').upload(path, compressed, { contentType: compressed.type }); if (error) throw error;
        uploaded = path; url = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }
      const values = { name: name.trim(), unit: unit.trim(), product_code:productCode.trim()||null, price_confirmed:priceConfirmed, stock_confirmed:stockConfirmed, description: description.trim(), price_paisa: amount, stock: Number(stock), category_id: category || null, is_active: active, image_url: url };
      const result = product ? await db.from('products').update(values).eq('id', product.id).eq('updated_at',product.updated_at).select('id').single() : await db.from('products').insert(values).select('id').single();
      if (result.error?.code === 'PGRST116') throw new Error('This product changed since you opened it. Cancel and reopen the editor before saving'); if (result.error) throw result.error; onSaved();
    } catch (error) { if (uploaded) await db.storage.from('product-images').remove([uploaded]); setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <><div className="section-head"><h2>{product ? 'Edit product' : 'Add product'}</h2><button className="quiet" onClick={onCancel} disabled={busy}>Cancel</button></div><form className="editor" onSubmit={save}><fieldset disabled={busy}>{product?.import_notes&&<p className="message">Source photo notes: {product.import_notes}</p>}<div className="form-grid"><label>Product code (optional)<input aria-label="Product code" value={productCode} onChange={event=>setProductCode(event.target.value)} maxLength={40}/></label><label>Product name<input value={name} onChange={event => setName(event.target.value)} maxLength={160} required/></label><label>Unit or pack size<input aria-label="Unit or pack size" value={unit} onChange={event => setUnit(event.target.value)} maxLength={40} required/></label><label>Price in rupees<input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} required/></label><label>Available stock quantity<input type="number" min="0" max="2147483647" step="1" value={stock} onChange={event => setStock(event.target.value)} required/></label><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Uncategorised</option>{categories.data?.map(item => <option key={item.id} value={item.id}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>)}</select></label><label>Product photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {setFile(event.target.files?.[0] ?? null);setImageRights(false);}}/><small>JPG, PNG or WebP, up to 5 MB</small></label></div><label className="check"><input type="checkbox" aria-label="Price confirmed" checked={priceConfirmed} onChange={event=>setPriceConfirmed(event.target.checked)}/>I have confirmed this price</label><label className="check"><input type="checkbox" aria-label="Stock confirmed" checked={stockConfirmed} onChange={event=>setStockConfirmed(event.target.checked)}/>I have confirmed this stock quantity</label><p className="footnote">Customers can add items to their bag; unconfirmed prices or stock are sent as shopping requests. Candidate prices from blurred photos are not offered at checkout.</p><label>Description<textarea maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} rows={4}/></label><label>Image URL (optional)<input type="url" maxLength={2048} value={imageUrl} onChange={event => {setImageUrl(event.target.value);setImageRights(false);}}/><small>An uploaded photo replaces this URL</small></label><CatalogueImage large product={{name:name.trim()||'Product image',image_url:imageUrl.trim()||null,image_key:product?.image_key??null}}/>{product?.image_key&&!imageUrl.trim()&&<p className="footnote">AI-generated illustration. Upload your own product photo to replace it.</p>} {needsImageRights && <label className="check"><input type="checkbox" aria-label="Image usage permission" checked={imageRights} onChange={event=>setImageRights(event.target.checked)}/>I own this image or have permission to use it commercially</label>}<label className="check"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>Visible to customers</label><Message error>{error || categories.error}</Message><button type="submit">{busy ? 'Saving…' : 'Save product'}</button></fieldset></form></>;
}

function Categories() {
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => { const { data, error } = await db.from('categories').select('*').order('name'); if (error) throw error; return data as Category[]; }, []);
  const resource = useLoad(load);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!name.trim()) throw new Error('Enter a category name');
      const values = { name: name.trim(), is_active: active };
      const { error } = editing ? await db.from('categories').update(values).eq('id', editing).select('id').single() : await db.from('categories').insert(values).select('id').single();
      if (error) throw error; setName(''); setActive(false); setEditing(null); setNotice('Category saved'); resource.refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function remove(item: Category) {
    if (!window.confirm(`Delete ${item.name}? Its products will become uncategorised.`)) return;
    setBusy(true); setError(''); setNotice('');
    const { error } = await db.from('categories').delete().eq('id', item.id).select('id').single();
    setBusy(false); if (error) setError(error.message); else { if (editing === item.id) { setEditing(null); setName(''); setActive(false); } setNotice('Category deleted'); resource.refresh(); }
  }
  return <><div className="section-head"><h2>Organise your catalogue</h2><button className="quiet" onClick={resource.refresh} disabled={resource.loading}>Refresh</button></div><form className="editor compact" onSubmit={save}><fieldset disabled={busy}><label>Category name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required/></label><label className="check"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>Visible to customers</label><div className="actions"><button type="submit">{busy ? 'Saving…' : editing ? 'Save category' : 'Add category'}</button>{editing && <button className="quiet" type="button" onClick={() => { setEditing(null); setName(''); setActive(false); }}>Cancel edit</button>}</div></fieldset></form><Message>{notice}</Message><Message error>{error || resource.error}</Message>{resource.loading ? <Loading/> : !resource.data?.length ? <Empty><h3>No categories yet</h3><p>Add a category to organise your real products</p></Empty> : <ul className="plain-list">{resource.data.map(item => <li key={item.id}><div><strong>{item.name}</strong><small>{item.is_active ? 'Active' : 'Inactive'}</small></div><div className="row-actions"><button className="quiet" disabled={busy} onClick={() => { setEditing(item.id); setName(item.name); setActive(item.is_active); window.scrollTo(0,0); }}>Edit</button><button className="quiet danger" disabled={busy} onClick={() => void remove(item)}>Delete</button></div></li>)}</ul>}</>;
}

function Orders() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    let query = db.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(page * 25, page * 25 + 24);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error, count } = await query; if (error) throw error; return { rows: data as Order[], count: count ?? 0 };
  }, [page, status]);
  const resource = useLoad(load);
  const refreshOrders = resource.refresh;
  useEffect(() => {
    if (busy || selected) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refreshOrders(); }, 15000);
    return () => window.clearInterval(timer);
  }, [busy, selected, refreshOrders]);
  async function update(order: Order, next: string) {
    if (!window.confirm(next === 'cancelled' ? (order.status === 'pending' ? 'Reject this order and restore its reserved stock?' : 'Cancel this order and restore its reserved stock?') : next === 'completed' ? 'Confirm this order is complete and cash has been collected?' : `Change this order to ${label(next).toLowerCase()}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { const pendingDecision = order.status === 'pending' && (next === 'accepted' || next === 'cancelled'); const { error } = await db.rpc(pendingDecision ? 'decide_pending_order' : 'set_order_status', { p_order_id: order.id, p_status: next }); if (error) throw error; setSelected(current => current?.id === order.id ? { ...current, status: next } : current); setNotice(next === 'accepted' ? 'Order accepted' : next === 'cancelled' && order.status === 'pending' ? 'Order rejected' : 'Order updated'); resource.refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <><div className="section-head"><div><h2>Delivery and pickup orders</h2><a href="#requests">View shopping requests</a><p>Accept, prepare and complete customer orders</p></div><button className="quiet" onClick={() => { setSelected(null); resource.refresh(); }} disabled={resource.loading || busy}>Refresh</button></div><div className="filters"><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); setSelected(null); }}><option value="all">All orders</option>{['pending','accepted','preparing','ready','out_for_delivery','completed','cancelled'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label></div><Message>{notice}</Message><Message error>{error || resource.error}</Message>
    {selected && <section className="order-detail"><div className="section-head"><h3>Order {selected.id.slice(0,8)}</h3><button className="quiet" onClick={() => setSelected(null)} disabled={busy}>Close details</button></div><p>{selected.id}</p><dl><div><dt>Customer</dt><dd>{selected.customer_name}</dd></div><div><dt>Phone</dt><dd><a href={`tel:${selected.phone}`}>{selected.phone}</a></dd></div><div><dt>Fulfilment</dt><dd>{label(selected.fulfilment)}</dd></div>{selected.fulfilment === 'delivery' && <div><dt>Address</dt><dd>{selected.address}</dd></div>}<div><dt>Status</dt><dd>{label(selected.status)}</dd></div><div><dt>Placed</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div></dl><ul className="order-items">{selected.items.map(item => <li key={item.id}><span>{item.quantity} × {item.name} ({item.unit}){item.product_code&&<small>Product code: {item.product_code}</small>}</span><strong>{money(item.price_paisa * item.quantity)}</strong></li>)}</ul><p>Items: {money(selected.subtotal_paisa)}</p><p>Delivery: {money(selected.delivery_fee_paisa)}</p><p className="total">Total: {money(selected.total_paisa)}</p><p>Payment: cash {selected.fulfilment === 'delivery' ? 'on delivery' : 'at pickup'}</p><div className="actions">{nextStatuses(selected).map(next => <button key={next} className={next === 'cancelled' ? 'danger quiet' : ''} disabled={busy} onClick={() => void update(selected, next)}>{next === 'completed' ? 'Complete, cash collected' : next === 'accepted' ? 'Accept' : next === 'cancelled' && selected.status === 'pending' ? 'Reject' : label(next)}</button>)}</div></section>}
    {resource.loading ? <Loading/> : !resource.data?.rows.length ? <Empty><h3>No orders to show</h3><p>Customer orders will appear here</p></Empty> : <div className="table-wrap"><table><caption className="sr-only">Customer orders</caption><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Type</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{resource.data.rows.map(order => <tr key={order.id}><td data-label="Order"><strong>{order.id.slice(0,8)}</strong><small>{new Date(order.created_at).toLocaleDateString()}</small></td><td data-label="Customer">{order.customer_name}</td><td data-label="Type">{label(order.fulfilment)}</td><td data-label="Total" className="number">{money(order.total_paisa)}</td><td data-label="Status">{label(order.status)}</td><td data-label="Actions"><div className="row-actions"><button className="quiet" onClick={() => { setSelected(order); window.scrollTo(0,0); }}>View order</button>{order.status === 'pending' && <><button disabled={busy} onClick={() => void update(order, 'accepted')} aria-label={`Accept order ${order.id.slice(0,8)}`}>Accept</button><button className="danger quiet" disabled={busy} onClick={() => void update(order, 'cancelled')} aria-label={`Reject order ${order.id.slice(0,8)}`}>Reject</button></>}</div></td></tr>)}</tbody></table></div>}<Pager page={page} count={resource.data?.count ?? 0} onPage={value => { setPage(value); setSelected(null); }}/></>;
}

function StoreSettings() {
  const load = useCallback(async () => { const { data, error } = await db.from('store_settings').select('*').eq('id',1).single(); if (error) throw error; return data as Settings; }, []);
  const resource = useLoad(load);
  if (resource.loading) return <Loading/>;
  if (resource.error || !resource.data) return <><Message error>{resource.error || 'Store settings not found'}</Message><button onClick={resource.refresh}>Try again</button></>;
  return <SettingsEditor initial={resource.data}/>;
}
function SettingsEditor({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [fee, setFee] = useState(rupees(initial.delivery_fee_paisa));
  const [minimum, setMinimum] = useState(rupees(initial.minimum_order_paisa));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const values = { ...settings, name: settings.name.trim(), address: settings.address.trim(), phone: settings.phone.trim(), email:settings.email.trim(), whatsapp_phone:settings.whatsapp_phone.trim(), delivery_fee_paisa: fee.trim() ? paisa(fee) : null, minimum_order_paisa: minimum.trim() ? paisa(minimum) : null };
      if (!values.name) throw new Error('Enter the store name');
      if (values.ordering_enabled && (!values.address || values.phone.length < 7 || values.minimum_order_paisa == null || (!values.delivery_enabled && !values.pickup_enabled) || (values.delivery_enabled && values.delivery_fee_paisa == null))) throw new Error('Before accepting orders, enter the address, phone and minimum order, and configure at least one fulfilment option with its fee');
      const { error } = await db.from('store_settings').update(values).eq('id',1).select('id').single(); if (error) throw error;
      setSettings(values); setMessage('Store settings saved');
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <><div className="section-head"><div><h2>Store settings</h2><p>Configure your real store details before accepting orders</p></div></div><form className="editor" onSubmit={save}><fieldset disabled={busy}><label>Store name<input value={settings.name} onChange={event => setSettings({ ...settings, name:event.target.value })} maxLength={160} required/></label><label>Store address<textarea maxLength={1000} value={settings.address} onChange={event => setSettings({ ...settings, address:event.target.value })} rows={3}/></label><div className="form-grid"><label>Contact phone<input type="tel" maxLength={30} value={settings.phone} onChange={event => setSettings({ ...settings, phone:event.target.value })}/></label><label>WhatsApp number (international format)<input type="tel" maxLength={16} value={settings.whatsapp_phone} onChange={event=>setSettings({...settings,whatsapp_phone:event.target.value})}/><small>Use + followed by country code and number. Leave blank to hide WhatsApp.</small></label><label>Contact email<input type="email" maxLength={254} value={settings.email} onChange={event=>setSettings({...settings,email:event.target.value})}/></label><label>Minimum order in rupees<input inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)}/><small>Enter 0 if there is no minimum</small></label><label>Delivery fee in rupees<input inputMode="decimal" value={fee} onChange={event => setFee(event.target.value)}/><small>Enter 0 for free delivery</small></label></div><label className="check"><input type="checkbox" checked={settings.delivery_enabled} onChange={event => setSettings({ ...settings, delivery_enabled:event.target.checked })}/>Offer home delivery</label><label className="check"><input type="checkbox" checked={settings.pickup_enabled} onChange={event => setSettings({ ...settings, pickup_enabled:event.target.checked })}/>Offer store pickup</label><label className="check"><input type="checkbox" checked={settings.ordering_enabled} onChange={event => setSettings({ ...settings, ordering_enabled:event.target.checked })}/>Accept customer orders</label><p className="footnote">Payments are cash on delivery or at pickup</p><Message>{message}</Message><Message error>{error}</Message><button type="submit">{busy ? 'Saving…' : 'Save settings'}</button></fieldset></form></>;
}
