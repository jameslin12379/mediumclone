var express = require('express');
var router = express.Router();
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy;
const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');
var bcrypt = require('bcryptjs');
var saltRounds = 10;
var multer  = require('multer');
var upload = multer();
var AWS = require('aws-sdk');
var s3 = new AWS.S3({
    accessKeyId: process.env.AWSAccessKeyId,
    secretAccessKey: process.env.AWSSecretKey
});
var moment = require('moment');
var mysql = require('mysql');

// Middlewares
function isNotAuthenticated(req, res, next) {
    if (!(req.isAuthenticated())){
        return next();
    }
    res.redirect('/403');
}

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()){
        return next();
    }
    res.redirect('/login');
}

// extract word after first slash and word after second slash
function isResource(req, res, next) {
    let uri = req._parsedOriginalUrl.path;
    if (uri.includes('/api')){
        uri = uri.substring(4);
    }
    uri = uri.substring(1);
    uri = uri.substring(0, uri.indexOf('/'));
    let table = uri.substring(0, uri.length - 1);
    let id = Number(req.params.id);
    let connection = mysql.createConnection({
        host     : process.env.DB_HOSTNAME,
        user     : process.env.DB_USERNAME,
        password : process.env.DB_PASSWORD,
        port     : process.env.DB_PORT,
        database : process.env.DB_NAME,
        multipleStatements: true
    });
    connection.query('SELECT id FROM ' + table + ' WHERE id = ?', [id], function(error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        if (results.length === 0){
            res.render('404');
        }
        else {
            next();
        }
    });
}

/* GET home page. */
// if user is logged in return feed page else return home page
router.get('/', function(req, res, next) {
  if (req.isAuthenticated()) {
      res.render('feed', {
          title: 'Feed',
          req: req
      })
  } else {
      res.render('index', {
          title: 'Medium clone',
          req: req
      });
  }
});

// USER ROUTES
router.get('/users/new', isNotAuthenticated, function(req, res, next){
    res.render('users/new', {
        title: 'Sign up',
        req: req,
        errors: req.flash('errors'),
        inputs: req.flash('inputs')
    });
});

// validate user input and if wrong redirect to register page with errors and inputs else save data into
// database and redirect to login with flash message
router.post('/users', isNotAuthenticated, [
    body('email', 'Empty email.').not().isEmpty(),
    body('password', 'Empty password.').not().isEmpty(),
    body('username', 'Empty username.').not().isEmpty(),
    body('email', 'Email must be between 5-200 characters.').isLength({min:5, max:200}),
    body('password', 'Password must be between 5-60 characters.').isLength({min:5, max:60}),
    body('username', 'Username must be between 5-200 characters.').isLength({min:5, max:200}),
    body('email', 'Invalid email.').isEmail(),
    body('password', 'Password must contain one lowercase character, one uppercase character, a number, and ' +
        'a special character.').matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?!.* )(?=.*[^a-zA-Z0-9]).{8,}$/, "i")
], function(req, res, next){
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('errors', errors.array());
        req.flash('inputs', {email: req.body.email, username: req.body.username});
        res.redirect('/users/new');
    }
    else {
        sanitizeBody('email').trim().escape();
        sanitizeBody('password').trim().escape();
        sanitizeBody('username').trim().escape();
        const email = req.body.email;
        const password = req.body.password;
        const username = req.body.username;
        bcrypt.hash(password, saltRounds, function(err, hash) {
            // Store hash in your password DB.
            if (err) {
                throw error;
            }
            connection.query('INSERT INTO user (email, username, password) VALUES (?, ?, ?)',
                [email, username, hash], function (error, results, fields) {
                    // error will be an Error if one occurred during the query
                    // results will contain the results of the query
                    // fields will contain information about the returned results fields (if any)
                    if (error) {
                        throw error;
                    }
                    req.flash('alert', 'You have successfully registered.');
                    res.redirect('/login');
                });
        });
    }
});

router.get('/users/:id', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?; SELECT p.id, ' +
        'p.name, p.description, p.datecreated, p.userid, p.topicid, u.username, u.imageurl as userimageurl, t.name as topicname ' +
        'from post as p inner join user as u on p.userid = u.id inner join topic as t on p.topicid = t.id where ' +
        'p.userid = ? ORDER BY p.datecreated DESC LIMIT 10;SELECT count(*) as postscount FROM post WHERE userid = ?;' +
        'SELECT count(*) as followingcount FROM userfollowing WHERE following = ?; SELECT count(*) as followerscount ' +
        'FROM userfollowing WHERE followed = ?; SELECT count(*) as topicscount FROM topicfollowing WHERE following = ?;' +
        'SELECT count(*) as commentscount FROM comment WHERE userid = ?;SELECT count(*) as likescount FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id],
        function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            if (req.isAuthenticated() && req.user.id !== req.params.id) {
                connection.query('SELECT count(*) as status FROM userfollowing WHERE following = ? and followed = ?;',
                    [req.user.id, req.params.id], function (error, result, fields) {
                        if (error) {
                            throw error;
                        }
                        res.render('users/show', {
                            title: 'Profile',
                            req: req,
                            results: results,
                            result: result,
                            moment: moment,
                            alert: req.flash('alert')
                        });
                    });
            } else {
                res.render('users/show', {
                    title: 'Profile',
                    req: req,
                    results: results,
                    moment: moment,
                    alert: req.flash('alert')
                });
            }
        });
});

router.get('/api/users/:id', isResource, function(req, res){
    connection.query('SELECT p.id, p.name, p.description, p.datecreated, p.userid, p.topicid,' +
        'u.username, u.imageurl as userimageurl, t.name as topicname from post as p inner join user as u ' +
        'on p.userid = u.id inner join topic as t on p.topicid = t.id where p.userid = ? ORDER BY p.datecreated ' +
        'DESC LIMIT 10 OFFSET ?;', [req.params.id, Number(req.query.skip)], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ results: results });
    });
});

router.get('/users/:id/following', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?; SELECT u.id, u.username, ' +
        'u.imageurl from userfollowing as uf inner join user as u on uf.followed = u.id where uf.following = ? ' +
        'ORDER BY uf.datecreated DESC LIMIT 10;SELECT count(*) as postscount FROM post WHERE userid = ?;SELECT count(*) ' +
        'as followingcount FROM userfollowing WHERE following = ?; SELECT count(*) as followerscount FROM userfollowing ' +
        'WHERE followed = ?; SELECT count(*) as topicscount FROM topicfollowing WHERE following = ?;SELECT count(*) as ' +
        'commentscount FROM comment WHERE userid = ?;SELECT count(*) as likescount FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id,
            req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('users/following', {
                title: 'User following',
                req: req,
                results: results,
                moment: moment,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/users/:id/following', isResource, function(req, res){
    connection.query('SELECT u.id, u.username, ' +
        'u.imageurl from userfollowing as uf inner join user as u on uf.followed = u.id where uf.following = ? ' +
        'ORDER BY uf.datecreated DESC LIMIT 10 OFFSET ?;', [req.params.id, Number(req.query.skip)],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ results: results });
    });
});

router.get('/users/:id/followers', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?; SELECT u.id, u.username, ' +
        'u.imageurl from userfollowing as uf inner join user as u on uf.following = u.id where uf.followed = ? ' +
        'ORDER BY uf.datecreated DESC LIMIT 10;SELECT count(*) as postscount FROM post WHERE userid = ?;SELECT count(*) ' +
        'as followingcount FROM userfollowing WHERE following = ?; SELECT count(*) as followerscount FROM userfollowing ' +
        'WHERE followed = ?; SELECT count(*) as topicscount FROM topicfollowing WHERE following = ?;SELECT count(*) as ' +
        'commentscount FROM comment WHERE userid = ?;SELECT count(*) as likescount FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('users/followers', {
                title: 'User followers',
                req: req,
                results: results,
                moment: moment,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/users/:id/followers', isResource, function(req, res){
    connection.query('SELECT u.id, u.username, ' +
        'u.imageurl from userfollowing as uf inner join user as u on uf.following = u.id where uf.followed = ? ' +
        'ORDER BY uf.datecreated DESC LIMIT 10 OFFSET ?;', [req.params.id, Number(req.query.skip)],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ results: results });
    });
});

router.get('/users/:id/topics', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?; SELECT t.id, ' +
        't.name, t.imageurl from topicfollowing as tf inner join topic as t on tf.followed = t.id where tf.following ' +
        '= ? ORDER BY tf.datecreated DESC LIMIT 10; SELECT count(*) as postscount FROM post WHERE userid = ?;SELECT ' +
        'count(*) as followingcount FROM userfollowing WHERE following = ?; SELECT count(*) as followerscount ' +
        'FROM userfollowing WHERE followed = ?; SELECT count(*) as topicscount FROM topicfollowing WHERE following = ?; ' +
        'SELECT count(*) as commentscount FROM comment WHERE userid = ?; SELECT count(*) as likescount FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id,
            req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('users/topics', {
                title: 'User topics',
                req: req,
                results: results,
                moment: moment,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/users/:id/topics', isResource, function(req, res){
    connection.query('SELECT t.id, t.name, t.imageurl from topicfollowing as tf inner join topic as t on ' +
        'tf.followed = t.id where tf.following = ? ORDER BY tf.datecreated DESC LIMIT 10 OFFSET ?',
        [req.params.id, Number(req.query.skip)], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.status(200).json({ results: results });
        });
});

router.post('/userfollowings', isAuthenticated, function(req, res) {
    connection.query('INSERT INTO userfollowing (following, followed) VALUES (?, ?)', [req.user.id, req.body.userid],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ status: "done" });
    });
});

router.delete('/userfollowings', isAuthenticated, function(req, res) {
    connection.query('DELETE FROM userfollowing WHERE following = ? and followed = ?', [req.user.id, req.body.userid],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ status: "done" });
    });
});

router.get('/login', isNotAuthenticated, function(req, res, next){
    res.render('login', {
        title: 'Log in',
        req: req,
        errors: req.flash('errors'),
        input: req.flash('input'),
        alert: req.flash('alert')
    });
});

router.post('/login', isNotAuthenticated, passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true
    })
);

router.get('/logout', isAuthenticated, function(req, res){
    req.logout();
    res.redirect('/login');
});

module.exports = router;
