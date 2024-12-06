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
  
  debug.info('Webhook request details:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers
  });

  debug.info('Environment check:', {
    hasSecret: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!endpointSecret,
    nodeEnv: process.env.NODE_ENV
  });

  if (process.env.NODE_ENV === 'development') {
    debug.warn('Webhook signature check skipped in development mode');
  } else if (!sig || !endpointSecret) {
    debug.error('Webhook validation failed:', {
      hasSignature: !!sig,
      hasEndpointSecret: !!endpointSecret
    });
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Missing signature or webhook secret',
        details: {
          hasSignature: !!sig,
          hasEndpointSecret: !!endpointSecret
        }
      })
    };
  }

  try {
    let stripeEvent: StripeEvent;
    
    if (process.env.NODE_ENV === 'development') {
      stripeEvent = JSON.parse(event.body || '');
    } else {
      try {
        stripeEvent = stripe.webhooks.constructEvent(
          event.body || '',
          sig!,
          endpointSecret!
        ) as StripeEvent;
        debug.info('Webhook signature verified successfully');
      } catch (err: any) {
        debug.error('Webhook signature verification failed:', {
          error: err.message,
          type: err.type,
          signature: sig?.substring(0, 20) + '...' // Log part of signature safely
        });
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Webhook signature verification failed',
            details: err.message
          })
        };
      }
    }

    debug.info('Processing webhook event:', {
      type: stripeEvent.type,
      objectType: stripeEvent.data.object.object
    });

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };

  } catch (err: any) {
    debug.error('Webhook processing error:', {
      message: err.message,
      stack: err.stack
    });
    
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Webhook processing failed',
        details: err.message
      })
    };
  }
};