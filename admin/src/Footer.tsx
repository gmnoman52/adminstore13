import { DeveloperCredit } from './DeveloperCredit';
import { useCallback, useState } from 'react';
import { db } from './api';
import { useLoad } from './useLoad';
export function Footer({ navigation = false }: { navigation?: boolean }) {
  const load = useCallback(async () => { const {data,error}=await db.from('store_settings').select('name,phone,email,address').eq('id',1).single(); if(error) throw error; return data; },[]);
  const {data} = useLoad(load);
  const [year] = useState(() => new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Karachi'}).format(new Date()));
  return <footer className="site-footer">{navigation && <nav aria-label="Footer navigation">{['dashboard','products','categories','orders','reports','requests','messages','privacy','settings'].map(page=><a key={page} href={`#${page}`}>{page[0].toUpperCase()+page.slice(1)}</a>)}</nav>}{data?.address && <p>{data.address}</p>}{data?.phone && <a href={`tel:${data.phone.replace(/[^+\d]/g,'')}`}>{data.phone}</a>}{data?.email && <a href={`mailto:${data.email}`}>{data.email}</a>}<p>Last updated: 11 November 2026</p><p>© {year} {data?.name || 'United Super Store'}</p><DeveloperCredit/></footer>;
}
