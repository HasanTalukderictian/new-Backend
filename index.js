const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

const port = process.env.PORT || 4000;



// middleware 

app.use(cors());
app.use(express.json());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vtmwivk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// verify jwt 
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_JWT, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("EcommerceDb").collection("users");
    const menuCollection = client.db("EcommerceDb").collection("menu");
    const reviewCollection = client.db("EcommerceDb").collection("review");
    const cartCollection = client.db("EcommerceDb").collection("carts");
    const paymentCollection = client.db("EcommerceDb").collection("payments");


    /// Warning use verifyJwt before verify Admin

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(401).send({ error: true, message: "Forbidden Access" })
      }
      next();
    }






    // trying to find users related apis 


    app.get('/users', verifyJwt, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;

      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return ({ message: " User Already Exists " })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);


    })

    // access token 
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_JWT, { expiresIn: '3h' });

      res.send({ token });


    })

    app.post('/menu', verifyJwt, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result)

    })

    // delete menu items 
    app.delete('/menu/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })


    // trying to get menu collection 
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);


    })

    app.get('/menu-stats', verifyJwt, async (req, res) => {

    
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // best way of a sum of a field

     
     

      res.send({
     
        products,
        orders,
   
      })
    })

    // trying to get reviews collection 
    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);


    })

    // cart collection related kaj

    app.post('/carts', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })

    // get Cart api data 
    app.get('/carts', verifyJwt, async (req, res) => {
      const email = req.query.email;



      if (!email) {
        return ([])
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        res.status(403).send({ error: true, message: 'forbidden Access' });
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);

    })

    // check user admin or not 

    app.get('/users/admin/:email', verifyJwt, async (req, res) => {

      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);

    })






    // admin 
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: `admin`
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result);
    })



    // delete an item from cart 

    app.delete('/carts:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })


    // create payment intent 
    app.post('/create-payment-intent', verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })

    // for storing  payment api 

    app.post('/payments', verifyJwt, async (req, res) => {
      const payment = req.body;
      const Insertedresult = await paymentCollection.insertOne(payment);
      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deletedResult = await cartCollection.deleteMany(query);
      res.send({ Insertedresult, deletedResult });

    })
    /// user count 
    app.get('/admin-stats', verifyJwt, verifyAdmin, async (req, res) => {

      const users = await usersCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // best way of a sum of a field

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);

      res.send({
        users,
        products,
        orders,
        revenue
      })
    })



    app.get('/order-stats',verifyJwt, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)

    })





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Server is Running')
})

app.listen(port, () => {
  console.log(`Server is Running on port ${port}`)
})