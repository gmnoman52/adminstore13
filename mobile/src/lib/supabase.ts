import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (key && !key.startsWith('sb_publishable_')) throw new Error('Customer apps require a Supabase publishable key');
if (url && (new URL(url).protocol !== 'https:' || new URL(url).username || new URL(url).password)) throw new Error('Use an HTTPS Supabase project URL');
export const supabase = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', storage: Platform.OS === 'web' ? undefined : { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync }, persistSession: true, autoRefreshToken: true, detectSessionInUrl: Platform.OS === 'web' },
}) : null;

export type Product = {
  id: string; name: string; description: string; unit: string;
  price_paisa: number; stock: number; image_url: string | null; category_id: string | null;
};

export async function fetchProducts(signal: AbortSignal): Promise<Product[]> {
  if (!supabase) throw new Error('Store connection is not configured');
  const products: Product[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await supabase.from('products')
      .select('id,name,description,unit,price_paisa,stock,image_url,category_id')
      .eq('is_active', true).order('name').order('id').range(offset, offset + 249).abortSignal(signal);
    if (error) throw error;
    products.push(...(data ?? []));
    if (!data || data.length < 250) return products;
  }
}

export function requireSupabase() { if (!supabase) throw new Error('Store connection is not configured'); return supabase; }
