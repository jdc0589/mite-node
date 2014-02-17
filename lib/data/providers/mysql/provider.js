require("../../../requireExtensions");

var q = require("q"),
	mysql = require("mysql");

module.exports = MigrationRepository;

function MigrationRepository(config) {
	this.config = config;
	this.connection = mysql.createConnection({
		host: config.host,
		database: config.database,
		user: config.user,
		password: config.password
	});
}

function errRejector (def, err) {
	if(err instanceof Error) {
		def.reject(err.message);
	} else {
		def.reject(err);
	}
}

MigrationRepository.prototype.connect = function() {
	var def = q.defer();

	try {
		this.connection.connect(function(err) {
			if(err) {
				errRejector(def, err);
			} else def.resolve();
		});
	}
	catch(err) {
		errRejector(def, err);
	}
	finally {
		return def.promise;
	}
};

MigrationRepository.prototype.close = function () {
	var def = q.defer();

	this.connection.end(function (err) {
		if (err) {
			errRejector(def, err);
		} else def.resolve();
	});

	return def.promise;
};

MigrationRepository.prototype._query = function (sql, params) {
	var connection = this.connection;
	var deferred = q.defer();

	try {
		connection.on("error", function (err) {
			errRejector(deferred, err);
		});
		connection.query(sql, params || [], function (err, result) {
			if (err) {
				errRejector(deferred, err);
			} else deferred.resolve(result);
		});
		
	} catch (err) {
		errRejector(deferred, err);
	}

	return deferred.promise;
};

MigrationRepository.prototype.isInitialized = function () {
	var self = this,
		sql = require("./queries/getMigrationTable.sql");

	return self._query(sql, [self.config.database, "_migration"]).then(function (rows) {
		return rows && rows.length === 1 && rows[0].table_name === "_migration";
	});
};

MigrationRepository.prototype.all = function () {
	return this._query("select * from _migration;").then(function (rows) {
		return rows.map(function (row) {
			return {
				key: row.key,
				hash: row.hash
			}
		});
	});
};

MigrationRepository.prototype.createMigrationTable = function () {
	var migrationsSql = require("./queries/createMigrationsTable.sql");
	return this._query(migrationsSql);
};

MigrationRepository.prototype.executeMigration = function (migration) {
	var self = this,
		insertQuery = require("./queries/insertMigration.sql");

	return self._query(migration.up).then(function () {
		return self._query(insertQuery, [migration.key, migration.hash]);
	});
};