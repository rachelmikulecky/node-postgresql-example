'use strict';

const _ = require('underscore');

//Database functions
const pg = require('pg');

let pool = new pg.Pool({
    host: 'localhost',
    database: 'booktown'
});

function runQuery(query, argsArray, callback) {
    pool.connect((err, client, done) => {
        if (err) {
            //likely a connection error that will print to console.
            done();
            throw err;
        }
        client.query(query, argsArray, (err, results) => {
           done();  //call done to release the client to the connection pool.
           callback(err, results); //make it the callers responsiblity for checking for query errors.
        });
    });
}

const yargs = require('yargs');

const args = yargs
    .alias('i', 'orderId')
    .describe('i', 'order id to operate on')
    .alias('b', 'bookId')
    .describe('b', 'book id to operate on')
    .alias('q', 'quantity')
    .describe('q', 'the quantity of the book')
    .alias('a', 'action')
    .demand('a')
    .describe('a', 'action to take [create, addItem, removeItem, updateItem, list, delete]')
    .argv;

function printer(fieldsToPrint) {
    return function(err, results) {
        if (err) {
            console.error(err);
        } else if (fieldsToPrint) {
            console.log(fieldsToPrint.join('\t'));
            console.log('--------------------------------');
            _.each(results.rows, (r) => {
                console.log((_.map(fieldsToPrint, (f) => {
                    return r[f];
                }).join('\t')));
            });
        }
        process.exit();
    }
}

function ensureRequired(map, fields, checkers) {
    if (fields.length !== checkers.length) {
        throw 'invalid fields and checkers';
    }
    let valid = _.all(fields, (f, i) => {
       return checkers[i](map[f]);
    });
    if (!valid) {
        throw 'checkers did not pass'
    }
}

try {
    var query;
    var params;
    switch (args.action) {
        case 'create':
            query = 'insert into orders (created, creator) values ($1, $2) returning id';
            params = [new Date().toISOString(), process.env.USER];
            runQuery(query, params, printer(['id']));
            break;
        case 'addItem':
            ensureRequired(args, ['orderId', 'bookId', 'quantity'], [_.isNumber, _.isNumber, _.isNumber]);
            query = 'insert into line_items (order_id, book_id, quantity) values ($1, $2, $3) returning *';
            params = [args.orderId, args.bookId, args.quantity];
            runQuery(query, params, printer(['order_id', 'book_id', 'quantity']));
            break;
        case 'removeItem':
            ensureRequired(args, ['orderId', 'bookId'], [_.isNumber, _.isNumber]);
            query = 'delete from line_items where order_id = $1 and book_id = $2';
            params = [args.orderId, args.bookId,];
            runQuery(query, params, printer());
            break;
        case 'updateItem':
            ensureRequired(args, ['orderId', 'bookId', 'quantity'], [_.isNumber, _.isNumber, _.isNumber]);
            query = 'update line_items set quantity = $1 where order_id = $2 and book_id = $3';
            params = [args.quantity, args.orderId, args.bookId];
            runQuery(query, params, printer());
            break;
        case 'list':
            ensureRequired(args, ['orderId'], [_.isNumber]);
            query = `
                select order_id, created, creator, book_id, title, quantity from orders
                    join line_items on orders.id = line_items.order_id
                    join books on line_items.book_id = books.id
                    where orders.id = $1;
            `;
            params = [args.orderId];
            runQuery(query, params, printer(['order_id', 'created', 'creator', 'book_id', 'quantity', 'title']));
            break;
        case 'delete':
            ensureRequired(args, ['orderId'], [_.isNumber]);
            query = `
                begin
                delete from orders where id = $1
                delete from line_items where order_id = $1
                commit
            `;
            params = [args.orderId];
            runQuery(query, params, printer(''));
            break;
        default:
            console.log('Action not supported');
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}