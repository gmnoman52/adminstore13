import keys from './catalogue-image-keys.json';
import type { Product } from './api';
const approvedKeys=new Set(keys);
export function CatalogueImage({product,large=false}:{product:Pick<Product,'name'|'image_url'|'image_key'>;large?:boolean}) {
  const remote=product.image_url?.startsWith(import.meta.env.VITE_SUPABASE_URL+'/storage/v1/object/public/product-images/') ? product.image_url : null;
  const generated=product.image_key && approvedKeys.has(product.image_key) ? '/catalogue/'+product.image_key+'.webp' : null;
  const source=remote??generated;
  return source ? <img className={large?'product-photo':'catalogue-thumb'} src={source} alt={product.name+(remote?'':' — AI illustration')} loading="lazy" width={large?128:56} height={large?128:56}/> : null;
}
