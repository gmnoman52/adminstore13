type Business={name:string;address:string;email:string};
export function replyEmailHref(recipient:string,store:Business) {
  const optOut=`mailto:${encodeURIComponent(store.email)}?subject=${encodeURIComponent('Unsubscribe from optional promotional email')}`;
  const body=`\n\n${store.name}\n${store.address}\n${store.email}\n\nUnsubscribe from optional promotional email: ${optOut}\nThis opt-out concerns promotions, not account security or a reply you requested.`;
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent('Your message to '+store.name)}&body=${encodeURIComponent(body)}`;
}
