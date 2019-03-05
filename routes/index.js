var express = require('express');
var router = express.Router();
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var { body,validationResult } = require('express-validator/check');
var { sanitizeBody } = require('express-validator/filter');
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
    if (uri.includes('?')){
        uri = uri.substring(0, uri.indexOf("?"));
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

// function isOwnResource(req, res, next) {
//     let uri = req._parsedOriginalUrl.path;
//     uri = uri.substring(1);
//     uri = uri.substring(0, uri.lastIndexOf('/'));
//     if (uri.includes('/')){
//         uri = uri.substring(0, uri.lastIndexOf('/'));
//     }
//     uri = uri.substring(0, uri.length - 1);
//     let table = uri;
//     let resourceid = req.params.id;
//     if (table === 'user') {
//         if (req.user.id !== Number(resourceid)) {
//             res.render('403');
//         } else {
//             next();
//         }
//     } else {
//         var connection = mysql.createConnection({
//             host     : process.env.DB_HOSTNAME,
//             user     : process.env.DB_USERNAME,
//             password : process.env.DB_PASSWORD,
//             port     : process.env.DB_PORT,
//             database : process.env.DB_NAME,
//             multipleStatements: true
//         });
//         connection.query('SELECT userid FROM ' + table + ' WHERE id = ?', [resourceid], function (error, results, fields) {
//             // error will be an Error if one occurred during the query
//             // results will contain the results of the query
//             // fields will contain information about the returned results fields (if any)
//             if (error) {
//                 throw error;
//             }
//             if (req.user.id !== results[0].userid) {
//                 res.render('403');
//             } else {
//                 next();
//             }
//         });
//     }
// }

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
          req: req,
          alert: req.flash('alert')
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

router.get('/users/:id/comments', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?;SELECT c.id, ' +
        'c.description, c.datecreated, c.userid, u.username, u.imageurl FROM comment as c inner join user as u on ' +
        'c.userid = u.id WHERE c.userid = ? ORDER BY c.datecreated DESC LIMIT 10; SELECT count(*) as postscount ' +
        'FROM post WHERE userid = ?; SELECT count(*) as followingcount FROM userfollowing WHERE following = ?; SELECT ' +
        'count(*) as followerscount FROM userfollowing WHERE followed = ?;SELECT count(*) as topicscount FROM topicfollowing' +
        ' WHERE following = ?; SELECT count(*) as commentscount FROM comment WHERE userid = ?;SELECT count(*) as likescount ' +
        'FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id,
            req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('users/comments', {
                title: 'User comments',
                req: req,
                results: results,
                moment: moment,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/users/:id/comments', isResource, function(req, res){
    connection.query('SELECT c.id, c.description, c.datecreated, c.userid, u.username, u.imageurl FROM comment ' +
        'as c inner join user as u on c.userid = u.id WHERE c.userid = ? ORDER BY c.datecreated DESC LIMIT 10 ' +
        'OFFSET ?', [req.params.id, Number(req.query.skip)], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({ results: results });
    });
});

router.get('/users/:id/likes', isResource, function(req, res){
    connection.query('SELECT id, username, description, imageurl, datecreated FROM user WHERE id = ?;SELECT p.id, ' +
        'p.name, p.description, p.datecreated, p.userid, p.topicid, u.username, ' +
        'u.imageurl as userimageurl, t.name as topicname from post as p inner join user as u on p.userid = u.id inner ' +
        'join topic as t on p.topicid = t.id inner join likes as l on p.id = l.liked where l.likes = ? ORDER BY ' +
        'l.datecreated DESC LIMIT 10; SELECT count(*) as postscount FROM post WHERE userid = ?; SELECT count(*) as ' +
        'followingcount FROM userfollowing WHERE following = ?; SELECT count(*) as followerscount FROM userfollowing ' +
        'WHERE followed = ?; SELECT count(*) as topicscount FROM topicfollowing WHERE following = ?;SELECT count(*) as ' +
        'commentscount FROM comment WHERE userid = ?; SELECT count(*) as likescount FROM likes WHERE likes = ?;',
        [req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id,
            req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('users/likes', {
                title: 'User likes',
                req: req,
                results: results,
                moment: moment,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/users/:id/likes', isResource, function(req, res){
    connection.query('SELECT p.id, p.name, p.description, p.datecreated, ' +
        'p.userid, p.topicid, u.username, u.imageurl as userimageurl, t.name as topicname ' +
        'from post as p inner join user as u on p.userid = u.id inner join topic as t on p.topicid = t.id ' +
        'inner join likes as l on p.id = l.liked where l.likes = ? ORDER BY l.datecreated DESC LIMIT 10 OFFSET ?'
        ,[req.params.id, Number(req.query.skip)], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.status(200).json({ results: results });
        });
});

router.get('/users/:id/edit', isResource, isAuthenticated, function(req, res){
    if (req.user.id === Number(req.params.id)){
        connection.query('SELECT id, email, username, description, imageurl FROM user WHERE id = ?', [req.params.id],
            function (error, results, fields) {
                // error will be an Error if one occurred during the query
                // results will contain the results of the query
                // fields will contain information about the returned results fields (if any)
                if (error) {
                    throw error;
                }
                res.render('users/edit', {
                    title: 'Edit profile',
                    req: req,
                    results: results,
                    errors: req.flash('errors'),
                    inputs: req.flash('inputs')
                });
            });
    } else {
        res.render('403');
    }
});

// checks if resource exists, if user is authenticated, and if user has the rights and if not
// return 404, login page, or 403 accordingly else performs form validation and if there are
// errors then redirect user to edit profile page with errors and inputs else sanitize data and upload
// new profile picture into AWS S3 and if successful check if user's current imageurl points to
// a picture different from default profile picture and if yes remove this picture then update
// user record with new data and if successful redirect to user profile page with a flash message
// indicating updated data
router.put('/users/:id', isResource, isAuthenticated, function(req, res, next){
    if (req.user.id === Number(req.params.id)){
        next();
    } else {
        res.render('403');
    }
}, upload.single('file'), [
    body('email', 'Empty email.').not().isEmpty(),
    body('username', 'Empty username.').not().isEmpty(),
    body('description', 'Empty description.').not().isEmpty(),
    body('email', 'Email must be between 5-200 characters.').isLength({min:5, max:200}),
    body('username', 'Username must be between 5-200 characters.').isLength({min:5, max:200}),
    body('description', 'Description must be between 5-200 characters.').isLength({min:5, max:200}),
    body('email', 'Invalid email.').isEmail()
], (req, res) => {
    const errors = validationResult(req);
    let errorsarray = errors.array();
    // file is not empty
    // file size limit (max 30mb)
    // file type is image
    if (req.file.size === 0){
        errorsarray.push({msg: "File cannot be empty."});
    }
    if (req.file.mimetype.slice(0, 5) !== 'image'){
        errorsarray.push({msg: "File type needs to be image."});
    }
    if (req.file.size > 30000000){
        errorsarray.push({msg: "File cannot exceed 30MB."});
    }
    if (errorsarray.length !== 0) {
        // There are errors. Render form again with sanitized values/errors messages.
        // Error messages can be returned in an array using `errors.array()`.
        req.flash('errors', errorsarray);
        req.flash('inputs', {email: req.body.email, username: req.body.username, description: req.body.description});
        res.redirect(req._parsedOriginalUrl.pathname + '/edit');
    }
    else {
        sanitizeBody('email').trim().escape();
        sanitizeBody('username').trim().escape();
        sanitizeBody('description').trim().escape();
        const email = req.body.email;
        const username = req.body.username;
        const description = req.body.description;
        const uploadParams = {
            Bucket: 'mediumclonebucket', // pass your bucket name
            Key: 'profiles/' + req.file.originalname, // file will be saved as testBucket/contacts.csv
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };
        s3.upload (uploadParams, function (err, data) {
            if (err) {
                console.log("Error", err);
            } if (data) {
                if (req.user.imageurl !== 'https://s3.amazonaws.com/imageappbucket/profiles/blank-profile-picture-973460_640.png'){
                    const uploadParams2 = {
                        Bucket: 'mediumclonebucket', // pass your bucket name
                        Key: 'profiles/' + req.user.imageurl.substring(req.user.imageurl.lastIndexOf('/') + 1) // file will be saved as testBucket/contacts.csv
                    };
                    s3.deleteObject(uploadParams2, function(err, data) {
                        if (err) console.log(err, err.stack);  // error
                        else     console.log();                 // deleted
                    });
                }
                connection.query('UPDATE user SET email = ?, username = ?, description = ?, imageurl = ? WHERE id = ?',
                    [email, username, description, data.Location, req.params.id], function (error, results, fields) {
                    // error will be an Error if one occurred during the query
                    // results will contain the results of the query
                    // fields will contain information about the returned results fields (if any)
                    if (error) {
                        throw error;
                    }
                    req.flash('alert', 'Profile edited.');
                    res.redirect(req._parsedOriginalUrl.pathname);
                });
            }
        });
    }
});

router.delete('/users/:id', isResource, isAuthenticated, function(req, res, next){
    if (req.user.id === Number(req.params.id)){
        next();
    } else {
        res.render('403');
    }
}, function(req, res){
    connection.query('DELETE FROM user WHERE id = ?', [req.params.id], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        req.flash('alert', 'Profile deleted.');
        req.logout();
        res.redirect('/');
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

// Topic routes
router.get('/topics', function(req, res){
    connection.query('SELECT * FROM topic ORDER BY name LIMIT 10', function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.render('topics/index', {
            title: 'Explore',
            req: req,
            results: results,
            alert: req.flash('alert')
        });
    });
});

router.get('/api/topics', function(req, res){
    connection.query('SELECT * FROM topic ORDER BY name LIMIT 10 OFFSET ?;', [Number(req.query.skip)],
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

router.get('/topics/:id', isResource, function(req, res){
    connection.query('SELECT id, name, description, imageurl, datecreated FROM `topic` WHERE id = ?; SELECT p.id, ' +
        'p.name, p.description, p.datecreated, p.userid, p.topicid, u.username, u.imageurl as userimageurl, ' +
        't.name as topicname from post as p inner join user as u on p.userid = u.id inner join topic as t on p.topicid ' +
        '= t.id where p.topicid = ? ORDER BY p.datecreated DESC LIMIT 10; SELECT count(*) as postscount ' +
        'FROM post WHERE topicid = ?;SELECT count(*) as followerscount FROM topicfollowing WHERE followed = ?',
        [req.params.id, req.params.id, req.params.id, req.params.id],
        function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            if (req.isAuthenticated()) {
                connection.query('SELECT count(*) as status FROM topicfollowing WHERE following = ? and ' +
                    'followed = ?;', [req.user.id, req.params.id],
                    function (error, result, fields) {
                        if (error) {
                            throw error;
                        }
                        res.render('topics/show', {
                            title: 'Topic',
                            req: req,
                            results: results,
                            result: result,
                            moment: moment,
                            alert: req.flash('alert')
                        });
                    });
            } else {
                res.render('topics/show', {
                    title: 'Topic',
                    req: req,
                    results: results,
                    moment: moment,
                    alert: req.flash('alert')
                });
            }
        });
});

router.get('/api/topics/:id', isResource, function(req, res){
    connection.query('SELECT p.id, p.name, p.description, p.datecreated, p.userid, p.topicid, u.username, ' +
        'u.imageurl as userimageurl, t.name as topicname from post as p inner join user as u on p.userid = ' +
        'u.id inner join topic as t on p.topicid = t.id where p.topicid = ? ORDER BY p.datecreated ' +
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

router.get('/topics/:id/followers', isResource, function(req, res){
    connection.query('SELECT id, name, description, imageurl FROM `topic` WHERE id = ?; SELECT u.id, u.username, ' +
        'u.imageurl from topicfollowing as tf inner join user as u on tf.following = u.id where tf.followed = ? ' +
        'ORDER BY tf.datecreated DESC LIMIT 10; SELECT count(*) as postscount FROM post WHERE topicid = ?;' +
        'SELECT count(*) as followerscount FROM topicfollowing WHERE followed = ?',
        [req.params.id, req.params.id, req.params.id, req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            res.render('topics/followers', {
                title: 'Topic followers',
                req: req,
                results: results,
                alert: req.flash('alert')
            });
        });
});

router.get('/api/topics/:id/followers', isResource, function(req, res){
    connection.query('SELECT u.id, u.username, u.imageurl from topicfollowing ' +
        'as tf inner join user as u on tf.following = u.id where tf.followed = ? ORDER ' +
        'BY tf.datecreated DESC LIMIT 10 OFFSET ?', [req.params.id, Number(req.query.skip)],
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

router.post('/topicfollowings', isAuthenticated, function(req, res) {
    connection.query('INSERT INTO topicfollowing (following, followed) VALUES (?, ?)',
        [req.user.id, req.body.topicid], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        // console.log(results);
        // res.json({tfid: results.insertId});
        res.status(200).json({status: 'done'});
    });
});

router.delete('/topicfollowings', isAuthenticated, function(req, res) {
    connection.query('DELETE FROM topicfollowing WHERE following = ? and followed = ?',
        [req.user.id, req.body.topicid], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({status: 'done'});
    });
});

// Post routes
router.get('/posts/new', isAuthenticated, function(req, res){
    res.render('posts/new', {
        title: 'Create',
        req: req,
        errors: req.flash('errors'),
        inputs: req.flash('inputs')
    });
});

router.post('/posts', isAuthenticated, [
    body('name', 'Empty name.').not().isEmpty(),
    body('description', 'Empty description.').not().isEmpty(),
    body('topic', 'Empty topic').not().isEmpty(),
    body('name', 'Name must be between 5-200 characters.').isLength({min:5, max:200}),
    body('description', 'Description must be between 5-300 characters.').isLength({min:5, max:300})
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('errors', errors.array());
        req.flash('inputs', {name: req.body.name, description: req.body.description, topic: req.body.topic});
        res.redirect('/posts/new');
    }
    else {
        sanitizeBody('name').trim().escape();
        sanitizeBody('description').trim().escape();
        sanitizeBody('topic').trim().escape();
        const name = req.body.name;
        const description = req.body.description;
        const topic = req.body.topic;
        connection.query('INSERT INTO post (name, description, userid, topicid) VALUES ' +
            '(?, ?, ?, ?)', [name, description, req.user.id, topic], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            req.flash('alert', 'Post created.');
            res.redirect(`/users/${req.user.id}`);
        });
    }
    }
);

router.get('/posts/:id', isResource, function(req, res){
    connection.query('UPDATE post SET views = views + 1 WHERE id = ?', [req.params.id], function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        connection.query('SELECT p.id, p.name, p.description, p.datecreated, p.userid, p.topicid, p.views, ' +
            'u.username, u.imageurl as userimageurl, t.name as topicname from post as p inner join user as u on ' +
            'p.userid = u.id inner join topic as t on p.topicid = t.id where p.id = ? ORDER BY p.datecreated ' +
            'DESC LIMIT 10; SELECT c.id, c.description, c.datecreated, c.userid, u.username, u.imageurl FROM ' +
            'comment as c inner join user as u on ' +
            'c.userid = u.id WHERE c.postid = ? ORDER BY c.datecreated DESC LIMIT 10;SELECT count(*) as ' +
            'commentscount FROM comment WHERE postid = ?;SELECT count(*) as likescount FROM likes WHERE liked = ?;',
            [req.params.id, req.params.id, req.params.id, req.params.id], function (error, results, fields) {
            // error will be an Error if one occurred during the query
            // results will contain the results of the query
            // fields will contain information about the returned results fields (if any)
            if (error) {
                throw error;
            }
            if (req.isAuthenticated()) {
                connection.query('SELECT count(*) as status FROM likes WHERE likes = ? and liked = ?;', [req.user.id, req.params.id],
                    function (error, result, fields) {
                        if (error) {
                            throw error;
                        }
                        res.render('posts/show', {
                            title: 'Post',
                            req: req,
                            results: results,
                            result: result,
                            moment: moment,
                            alert: req.flash('alert')
                        });
                    });
            } else {
                res.render('posts/show', {
                    title: 'Post',
                    req: req,
                    results: results,
                    moment: moment,
                    alert: req.flash('alert')
                });
            }
        });
    });
});

router.get('/api/posts/:id', isResource, function(req, res){
    connection.query('SELECT c.id, c.description, c.datecreated, c.userid, u.username, ' +
        'u.imageurl FROM comment as c inner join user as u on c.userid = u.id WHERE c.postid = ?' +
        ' ORDER BY c.datecreated DESC LIMIT 10 OFFSET ?', [req.params.id, Number(req.query.skip)],
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

router.post('/likes', isAuthenticated, function(req, res) {
    connection.query('INSERT INTO likes (likes, liked) VALUES (?, ?)', [req.user.id, req.body.postid],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        // console.log(results);
        // res.json({tfid: results.insertId});
        res.status(200).json({status: 'done'});
    });
});

router.delete('/likes', isAuthenticated, function(req, res) {
    connection.query('DELETE FROM likes WHERE likes = ? and liked = ?', [req.user.id, req.body.postid],
        function (error, results, fields) {
        // error will be an Error if one occurred during the query
        // results will contain the results of the query
        // fields will contain information about the returned results fields (if any)
        if (error) {
            throw error;
        }
        res.status(200).json({status: 'done'});
    });
});

router.post('/comments', isAuthenticated, [
        body('description', 'Empty description.').not().isEmpty(),
        body('description', 'Description must be between 5-300 characters.').isLength({min:5, max:300})
    ],
    (req, res) => {
        const errors = validationResult(req);
        let errorsarray = errors.array();
        if (errorsarray.length !== 0) {
            // There are errors. Render form again with sanitized values/errors messages.
            // Error messages can be returned in an array using `errors.array()`.
            res.status(400).json({ status: false, errors: errorsarray });
        }
        else {
            sanitizeBody('description').trim().escape();
            const description = req.body.description;
            connection.query('INSERT INTO comment (description, userid, postid) VALUES ' +
                '(?, ?, ?)', [description, req.user.id, req.body.postid], function (error, results, fields) {
                // error will be an Error if one occurred during the query
                // results will contain the results of the query
                // fields will contain information about the returned results fields (if any)
                if (error) {
                    throw error;
                }
                connection.query('SELECT c.id, c.description, c.datecreated, c.userid, u.username, u.imageurl FROM comment as c inner join user as u on c.userid = u.id WHERE c.id = ?', [results.insertId],
                    function (error2, results2, fields2){
                        if (error) {
                            throw error;
                        }
                        res.status(200).json({ status: true, comment: results2 });
                    });

            });
            // console.log("Upload Success", data.Location);
        }
    }
);


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
