import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import { debug } from '../../src/utils/debug';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
 apiVersion: '2023-10-16'
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

interface StripeMetadata {
 userEmail: string;
 giftEmail?: string;
 [key: string]: string | undefined;
}

interface StripeCustomer extends Omit<Stripe.Customer, 'metadata'> {
 metadata: StripeMetadata;
}

interface StripeEvent {
 type: string;
 data: {
   object: Stripe.Checkout.Session | Stripe.Subscription;
 };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: '' };
  }
  
  const sig = event.headers['stripe-signature'];
  
  debug.info('Webhook Headers:', JSON.stringify(event.headers, null, 2));
  debug.info('Stripe Signature:', sig);
  debug.info('Endpoint Secret exists:', !!endpointSecret);

  if (process.env.NODE_ENV === 'development') {
    debug.warn('Webhook signature check skipped in development mode');
  } else if (!sig || !endpointSecret) {
    debug.error('Missing signature or webhook secret');
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: 'Missing signature or webhook secret',
        headers: event.headers, // Temporarily include headers in error response
        sig: sig || 'missing'
      })
    };
  }

  try {
    let stripeEvent: StripeEvent;
    
    if (process.env.NODE_ENV === 'development') {
      stripeEvent = JSON.parse(event.body || '');
    } else {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body || '',
        sig!,
        endpointSecret!
      ) as StripeEvent;
    }

    debug.info('Processing webhook event:', stripeEvent.type);

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata as unknown as StripeMetadata;
        
        if (session.customer) {
          await stripe.customers.update(session.customer as string, {
            metadata: {
              userEmail: metadata.userEmail,
              giftEmail: metadata.giftEmail || ''
            }
          });
        }
        debug.info('Subscription activated for:', metadata.userEmail);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        if (subscription.customer) {
          const customer = await stripe.customers.retrieve(
            subscription.customer as string
          ).then(result => result as unknown as StripeCustomer);
          
          debug.info('Subscription updated for:', customer.metadata.userEmail);
        }
        break;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (err: unknown) {
    debug.error('Webhook error:', err);
    
    let errorMessage = 'Webhook error';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: errorMessage,
        headers: event.headers, // Temporarily include headers in error response
        sig: sig || 'missing'
      })
    };
  }
};