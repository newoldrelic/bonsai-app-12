import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import { debug } from '../../src/utils/debug';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "bonsai-c0690",
      clientEmail: "firebase-adminsdk-qqw8j@bonsai-c0690.iam.gserviceaccount.com",
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    databaseURL: "https://bonsai-c0690.firebaseio.com"
  });
}

const db = admin.firestore();

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

async function updateFirestoreSubscription(
  userEmail: string, 
  subscription: Stripe.Subscription
) {
  const subscriptionData = {
    id: subscription.id,
    userEmail,
    status: subscription.status,
    planId: subscription.items.data[0]?.price.id || 'unknown',
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: admin.firestore.Timestamp.now()
  };

  debug.info('Updating Firestore subscription:', subscriptionData);

  try {
    await db.collection('subscriptions').doc(userEmail).set(subscriptionData);
    debug.info('Firestore subscription updated successfully');
  } catch (error) {
    debug.error('Error updating Firestore subscription:', error);
    throw error;
  }
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
        
        if (session.customer && session.subscription) {
          // Update customer metadata
          await stripe.customers.update(session.customer as string, {
            metadata: {
              userEmail: metadata.userEmail,
              giftEmail: metadata.giftEmail || ''
            }
          });

          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          // Update Firestore
          await updateFirestoreSubscription(metadata.userEmail, subscription);
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
          
          await updateFirestoreSubscription(customer.metadata.userEmail, subscription);
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