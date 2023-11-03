frappe.ui.POSCommandsBuilder = class extends frappe.ui.POSCommandsBuilder{
    validate_add_pos_item(item_list, redirect_to_profile){
        super.validate_add_pos_item(item_list, redirect_to_profile)
        var profile = frappe.pos_interface_builder.hw_profile
        if (window.serial_port) {
            qz.serial.sendData(window.serial_port, "\ftxn_line_1\ntxn_lin_2")
        }
    }
    print_receipt(pos_invoice_name, pos_print_format){
		var me = this;
        if (!pos_invoice_name || !pos_print_format) return
		if (window.raw_printer){
            console.log(me.pos_interface.doc_obj["POS Invoice"])

			me.get_raw_commands(pos_invoice_name, pos_print_format,function (out) {
                frappe.ui.form
                    .qz_connect()
                    .then(function () {
                        var data ;
                        if (out.raw_printing){
                            data = [out.print_data]
                        }
                        else {
                            data = [{
                                type: 'pixel',
                                format: 'html',
                                flavor: 'plain',
                                data: out.print_data
                            }]
                        }
                        let config = qz.configs.create(window.raw_printer);
                        return qz.print(config, data);
                    })
                    .then(frappe.ui.form.qz_success)
                    .catch((err) => {
                        frappe.ui.form.qz_fail(err);
                    });
            })
		}
        else {
            frappe.utils.print(
				"POS Invoice",
				pos_invoice_name,
				pos_print_format,
				0,
				frappe.boot.lang
			);
        }
	}
    get_raw_commands(pos_invoice, pos_print_format,callback) {
		frappe.call({
			method: "hw_integration.utils.print.get_print_content",
			args: {
				pos_invoice: pos_invoice,
				print_format: pos_print_format
			},
			callback: function (r) {
				if (!r.exc) {
					callback(r.message);
				}
			},
		});
	}

}

frappe.ui.POSOpening = class extends frappe.ui.POSOpening {
    async prepare_app_defaults(data) {
        var me = this
        await super.prepare_app_defaults(data)
        await frappe.db.get_doc('QZ Settings', undefined).then((qz_doc) => {
            if(qz_doc.trusted_certificate != null && qz_doc.trusted_certificate != "" && qz_doc.private_certificate != "" && qz_doc.private_certificate != null){
                frappe.ui.form.qz_init().then(function(){
                    ///// QZ Certificate ///
                    qz.security.setCertificatePromise(function(resolve, reject) {
                        resolve(qz_doc.trusted_certificate);
                    });
                    qz.security.setSignaturePromise(function(toSign) {
                        return function(resolve, reject) {
                            try {
                                var pk = KEYUTIL.getKey(qz_doc.private_certificate);
                                //var sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                                var sig = new KJUR.crypto.Signature({"alg": "SHA1withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                                sig.init(pk); 
                                sig.updateString(toSign);
                                var hex = sig.sign();
                                resolve(stob64(hextorstr(hex)));
                            } catch (err) {
                                console.error(err);
                                reject(err);
                            }
                        };
                    });
                    qz_connect()
                });
            }
            else {
                frappe.ui.form.qz_init().then(()=>{
                    qz_connect()
                })
            }
        });
        // await frappe.ui.form.qz_connect()
        var hw_profile = (await frappe.db.get_value("POS Profile", me.pos_profile, "custom_hardware_profile")).message?.custom_hardware_profile
        if (hw_profile) {
            await frappe.db.get_value("Hardware Profile", hw_profile, "*", (values)=>{
                frappe.pos_interface_builder.hw_profile = values
            })

            var profile = frappe.pos_interface_builder.hw_profile        
            if (profile.port && (profile.wlc_line_1 || profile.wlc_line_2)) {
                await qz.serial.findPorts().then((data)=>{
                    if (data.includes(profile.port)) {
                        qz.serial.openPort(profile.port).then(
                            ()=> {
                                window.serial_port = profile.port
                                qz.serial.sendData(profile.port, "\f"+profile.wlc_line_1)
                                if (profile.wlc_line_2) qz.serial.sendData(profile.port, profile.wlc_line_2)
                            },
                            ()=>{
                                console.log("Hardware not found")
                            }
                        )
                    }
                })
            }
        }

        window.has_printer = profile.has_printer;
        if(window.has_printer == 1){
            if (profile.printer_name_for_transactions) {
                window.raw_printer = profile.printer_name_for_transactions
            }
            else {
                var d = new frappe.ui.Dialog({
                    'fields': [
                        {'fieldname': 'printer', 'fieldtype': 'Select', 'reqd': 1, 'label': "Printer"}
                    ],
                    primary_action: function(){
                        window.raw_printer = d.get_values().printer;
                        d.hide();
                    },
                    secondary_action: function(){
                        d.hide();
                    },
                    secondary_action_label: "Cancel",
                    'title': 'Select printer for Raw Printing'
                });
                await frappe.ui.form.qz_get_printer_list().then((data) => {
                    d.set_df_property('printer', 'options', data);
                    d.show();
                });	
            }
        }
        window.is_cash_drawer_attached = profile.is_cash_drawer_attached;
    }
}

function qz_connect() {
    return new Promise(function (resolve, reject) {
        if (qz.websocket.isActive()) {
            // if already active, resolve immediately
            // frappe.show_alert({message: __('QZ Tray Connection Active!'), indicator: 'green'});
            resolve();
        } else {
            // try to connect once before firing the mimetype launcher
            frappe.show_alert({
                message: __("Attempting Connection to QZ Tray..."),
                indicator: "blue",
            });
            qz.websocket.connect().then(
                () => {
                    frappe.show_alert({
                        message: __("Connected to QZ Tray!"),
                        indicator: "green",
                    });
                    resolve();
                },
                function retry(err) {
                    if (err.message === "Unable to establish connection with QZ") {
                        // if a connect was not successful, launch the mimetype, try 3 more times
                        frappe.show_alert(
                            {
                                message: __("Attempting to launch QZ Tray..."),
                                indicator: "blue",
                            },
                            14
                        );
                        window.location.assign("qz:launch");
                        qz.websocket
                            .connect({
                                retries: 3,
                                delay: 1,
                            })
                            .then(
                                () => {
                                    frappe.show_alert({
                                        message: __("Connected to QZ Tray!"),
                                        indicator: "green",
                                    });
                                    resolve();
                                },
                                () => {
                                    frappe.throw(
                                        __(
                                            'Error connecting to QZ Tray Application...<br><br> You need to have QZ Tray application installed and running, to use the Raw Print feature.<br><br><a target="_blank" href="https://qz.io/download/">Click here to Download and install QZ Tray</a>.<br> <a target="_blank" href="https://erpnext.com/docs/user/manual/en/setting-up/print/raw-printing">Click here to learn more about Raw Printing</a>.'
                                        )
                                    );
                                    reject();
                                }
                            );
                    } else {
                        frappe.show_alert(
                            {
                                message: "QZ Tray " + err.toString(),
                                indicator: "red",
                            },
                            14
                        );
                        reject();
                    }
                }
            );
        }
    })
}