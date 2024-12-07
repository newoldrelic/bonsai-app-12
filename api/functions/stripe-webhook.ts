import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import { debug } from '../../src/utils/debug';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set');
    }

    // Handle the private key string properly
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "bonsai-c0690",
        clientEmail: "firebase-adminsdk-qqw8j@bonsai-c0690.iam.gserviceaccount.com",
        privateKey: formattedPrivateKey
      })
    });

    debug.info('Firebase Admin initialized successfully');
  } catch (error) {
    debug.error('Firebase Admin initialization error:', error);
  }
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function updateFirestoreSubscription(subscription: Stripe.Subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const userEmail = customer.email;
  
  if (!userEmail) {
    throw new Error('No email found for customer');
  }

  const subscriptionData = {
    id: subscription.id,
    userEmail,
    status: subscription.status,
    planId: subscription.items.data[0].price.id,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const subscriptionRef = db.doc(`subscriptions/${userEmail}`);
  await subscriptionRef.set(subscriptionData, { merge: true });
  debug.info(`Subscription ${subscription.status} for: ${userEmail}`);
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,stripe-signature',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const sig = event.headers['stripe-signature'];
  debug.info('Webhook Headers:', event.headers);
  debug.info('Stripe Signature:', sig);
  debug.info('Endpoint Secret exists:', !!endpointSecret);

  if (!sig || !endpointSecret) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing signature or webhook secret' })
    };
  }

  try {
    const stripeEvent = stripe.webhooks.constructEvent(
      event.body || '',
      sig,
      endpointSecret
    );

    debug.info('Processing webhook event:', stripeEvent.type);

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await updateFirestoreSubscription(subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        await updateFirestoreSubscription(subscription);
        break;
      }

      default:
        debug.info(`Unhandled event type: ${stripeEvent.type}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true })
    };

  } catch (error: any) {
    debug.error('Webhook processing error:', error);
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      })
    };
  }
};